import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface CoachData {
  name: string;
  school: string;
  conference: string;
  division?: string;
  program?: string;
  team_size?: number;
  current_software?: string;
  pain_points?: string[];
  notes?: string;
  tags?: string[];
  decision_timeline?: string;
}

interface RequestBody {
  template: string;
  subject: string;
  coachData: CoachData;
  senderName?: string;
}

// ── Sentence fragments keyed by topic ──
const OPENERS: Record<string, string[]> = {
  season: [
    "Hope the season is going well for {school}.",
    "Hope things are rolling for {school} this season.",
    "Sounds like {school} has had a solid run so far.",
  ],
  intro: [
    "I run GolfHelm — we build team management and analytics tools for college golf.",
    "Quick intro — I'm the founder of GolfHelm, a platform built for college golf programs.",
    "I started GolfHelm to help college golf coaches manage their programs more efficiently.",
  ],
  conference: [
    "A few {conference} programs have been using us this season and the feedback's been great.",
    "We've been working with several {conference} coaches lately.",
    "Some {conference} teams have come on board recently and it's been a great fit.",
  ],
  software: [
    "I know a lot of programs using {current_software} have been looking for something more golf-specific.",
    "Heard from a few coaches that {current_software} doesn't quite fit for golf — we built GolfHelm to fill that gap.",
  ],
  pain_point: [
    "I know {pain_point} can be a real headache — that's actually one of the main things we solve.",
    "A lot of coaches mention {pain_point} as a challenge. We've built some really targeted solutions for that.",
  ],
  team_size: [
    "With a roster of {team_size}, you've got a solid group — GolfHelm scales really well for teams your size.",
    "For a program with {team_size} players, having centralized round tracking and stats makes a big difference.",
  ],
  timeline: [
    "I know you mentioned wanting to make a decision {decision_timeline} — happy to work around your timeline.",
    "Since you're looking at {decision_timeline}, wanted to make sure you had everything you need.",
  ],
  notes_ref: [
    "Based on what we've discussed, I think there's a really good fit here.",
    "From our conversations, sounds like {school} is in a great spot to get a lot out of this.",
  ],
  cta: [
    "Would you have 10 minutes this week for a quick call?",
    "Happy to set up a quick walkthrough whenever works for you.",
    "Let me know if you'd be open to a quick demo — no pressure.",
    "What does your schedule look like this week?",
    "Want me to walk you through it?",
  ],
};

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length]!;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}

function replaceTags(text: string, data: CoachData): string {
  return text
    .replace(/\{school\}/g, data.school || "your program")
    .replace(/\{conference\}/g, data.conference || "your conference")
    .replace(/\{division\}/g, data.division || "")
    .replace(/\{current_software\}/g, data.current_software || "")
    .replace(/\{team_size\}/g, String(data.team_size || ""))
    .replace(/\{decision_timeline\}/g, data.decision_timeline || "soon")
    .replace(/\{pain_point\}/g, data.pain_points?.[0] || "");
}

function personalize(template: string, subject: string, coach: CoachData): { subject: string; body: string } {
  // Use coach name as seed for deterministic but varied selection
  const seed = hashStr(coach.name + coach.school);
  const lines: string[] = [];

  // Parse the template to understand its intent
  const templateLower = template.toLowerCase();
  const isIntro = templateLower.includes("intro") || templateLower.includes("i'm rick") || templateLower.includes("i run");
  const isFollowUp = templateLower.includes("follow") || templateLower.includes("chatting") || templateLower.includes("conversation");
  const isCheckIn = templateLower.includes("check in") || templateLower.includes("checking in") || templateLower.includes("season");
  const isReEngage = templateLower.includes("haven't heard") || templateLower.includes("bump") || templateLower.includes("reach back");

  // Build personalized paragraphs based on available data
  if (isCheckIn || isFollowUp) {
    lines.push(replaceTags(pick(OPENERS.season, seed), coach));
  }

  if (isIntro) {
    lines.push(replaceTags(pick(OPENERS.intro, seed + 1), coach));
  }

  // Add conference reference if available
  if (coach.conference && (isIntro || isCheckIn)) {
    lines.push(replaceTags(pick(OPENERS.conference, seed + 2), coach));
  }

  // Reference their current software if known
  if (coach.current_software && (isIntro || isReEngage)) {
    lines.push(replaceTags(pick(OPENERS.software, seed + 3), coach));
  }

  // Reference pain points if available
  if (coach.pain_points?.length && coach.pain_points[0]) {
    lines.push(replaceTags(pick(OPENERS.pain_point, seed + 4), coach));
  }

  // Reference team size if available
  if (coach.team_size && isIntro) {
    lines.push(replaceTags(pick(OPENERS.team_size, seed + 5), coach));
  }

  // Reference decision timeline if available
  if (coach.decision_timeline && !isIntro) {
    lines.push(replaceTags(pick(OPENERS.timeline, seed + 6), coach));
  }

  // Reference notes if available
  if (coach.notes && isFollowUp) {
    lines.push(replaceTags(pick(OPENERS.notes_ref, seed + 7), coach));
  }

  // Add CTA
  lines.push(replaceTags(pick(OPENERS.cta, seed + 8), coach));

  // If we generated enough content, use it. Otherwise fall back to the original template.
  if (lines.length >= 2) {
    // Group into paragraphs (2-3 sentences each)
    const paragraphs: string[] = [];
    let current: string[] = [];
    for (const line of lines) {
      current.push(line);
      if (current.length >= 2) {
        paragraphs.push(current.join(" "));
        current = [];
      }
    }
    if (current.length > 0) paragraphs.push(current.join(" "));

    return {
      subject: replaceTags(subject, coach),
      body: paragraphs.join("\n\n"),
    };
  }

  // Fallback: return original template with tags replaced
  return {
    subject: replaceTags(subject, coach),
    body: replaceTags(template, coach),
  };
}

Deno.serve(async (req: Request) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { template, subject, coachData } = (await req.json()) as RequestBody;

    if (!template || !subject || !coachData) {
      return new Response(
        JSON.stringify({ error: "template, subject, and coachData are required" }),
        { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const result = personalize(template, subject, coachData);

    return new Response(
      JSON.stringify({ ...result, model: "smart-template-engine" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      }
    );
  } catch (error) {
    console.error("personalize-email error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});
