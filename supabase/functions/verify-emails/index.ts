import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface VerifyResult {
  email: string;
  valid: boolean;
  reason: string;
}

async function smtpVerify(email: string): Promise<VerifyResult> {
  const domain = email.split("@")[1];
  if (!domain) return { email, valid: false, reason: "Invalid format" };

  try {
    // Resolve MX records
    const mxRecords = await Deno.resolveDns(domain, "MX");
    if (!mxRecords || mxRecords.length === 0) {
      return { email, valid: false, reason: "No MX records" };
    }

    // Sort by preference (lowest first), pick best
    mxRecords.sort((a, b) => a.preference - b.preference);
    const mxHost = mxRecords[0].exchange;

    // Connect to SMTP server
    const conn = await Deno.connect({ hostname: mxHost, port: 25 });
    const reader = conn.readable.getReader();
    const writer = conn.writable.getWriter();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    async function readResponse(): Promise<string> {
      const { value } = await reader.read();
      return value ? decoder.decode(value) : "";
    }

    async function sendCommand(cmd: string): Promise<string> {
      await writer.write(encoder.encode(cmd + "\r\n"));
      return await readResponse();
    }

    try {
      // Read greeting
      const greeting = await readResponse();
      if (!greeting.startsWith("220")) {
        return { email, valid: false, reason: `Bad greeting: ${greeting.trim().slice(0, 100)}` };
      }

      // EHLO
      const ehlo = await sendCommand("EHLO helmsportslabs.com");
      if (!ehlo.startsWith("250")) {
        return { email, valid: false, reason: `EHLO rejected: ${ehlo.trim().slice(0, 100)}` };
      }

      // MAIL FROM
      const mailFrom = await sendCommand("MAIL FROM:<verify@helmsportslabs.com>");
      if (!mailFrom.startsWith("250")) {
        return { email, valid: false, reason: `MAIL FROM rejected: ${mailFrom.trim().slice(0, 100)}` };
      }

      // RCPT TO — this is the actual verification
      const rcptTo = await sendCommand(`RCPT TO:<${email}>`);
      const code = parseInt(rcptTo.substring(0, 3));

      await sendCommand("QUIT");

      if (code === 250 || code === 251) {
        return { email, valid: true, reason: "Mailbox exists" };
      } else if (code === 550 || code === 551 || code === 552 || code === 553 || code === 554) {
        return { email, valid: false, reason: `Mailbox rejected (${code}): ${rcptTo.trim().slice(0, 200)}` };
      } else if (code === 450 || code === 451 || code === 452) {
        return { email, valid: true, reason: `Temporary (${code}) — assuming valid` };
      } else {
        return { email, valid: true, reason: `Unknown (${code}) — assuming valid` };
      }
    } finally {
      try { reader.releaseLock(); writer.releaseLock(); conn.close(); } catch { /* ignore */ }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Connection refused or timeout — server exists but blocked us, assume valid
    if (msg.includes("refused") || msg.includes("timeout") || msg.includes("timed out")) {
      return { email, valid: true, reason: `Connection issue — assuming valid: ${msg}` };
    }
    return { email, valid: false, reason: msg };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "authorization, content-type, apikey" } });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { batch_size = 50, offset = 0 } = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Get coaches to verify
    const { data: coaches, error } = await supabase
      .from("crm_coaches")
      .select("id, name, school, email")
      .eq("is_archived", false)
      .eq("email_status", "valid")
      .not("email", "is", null)
      .order("school")
      .range(offset, offset + batch_size - 1);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    if (!coaches || coaches.length === 0) {
      return new Response(JSON.stringify({ done: true, message: "No more coaches to verify", offset }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const results: Array<{ name: string; school: string; email: string; valid: boolean; reason: string }> = [];
    let invalidCount = 0;

    for (const coach of coaches) {
      const result = await smtpVerify(coach.email.trim().toLowerCase());
      results.push({ name: coach.name, school: coach.school, email: coach.email, valid: result.valid, reason: result.reason });

      if (!result.valid) {
        invalidCount++;
        await supabase
          .from("crm_coaches")
          .update({ email_status: "bounced", updated_at: new Date().toISOString() })
          .eq("id", coach.id);
      }

      // Small delay
      await new Promise(r => setTimeout(r, 500));
    }

    return new Response(
      JSON.stringify({
        processed: coaches.length,
        valid: coaches.length - invalidCount,
        invalid: invalidCount,
        next_offset: offset + batch_size,
        results,
      }),
      { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
