import { Fragment, type ReactNode } from 'react';

/**
 * ChatMarkdown — minimal, dependency-free markdown-ish renderer for the Ask
 * CoachHelm chat reply text (audit W2).
 * ----------------------------------------------------------------------------
 * The coach-chat agent's system prompt (`COACH_CHAT_INSTRUCTIONS` in
 * lib/coachhelm/v3/chat/agent.ts) itself uses **bold** and list markdown, and
 * the model naturally answers in kind — bold player/metric names, bullet or
 * numbered lists. `ChatMessageList` was rendering that content as a raw
 * string, so coaches saw literal `**Mason Reed**` asterisks and `- ` bullets
 * instead of formatted text.
 *
 * There is no markdown-rendering dependency anywhere in this repo (checked
 * package.json + node_modules): `plan-markdown.ts` only *serializes*
 * structured data INTO a markdown string, and the "Markdown" badge in
 * documents/TextPreview.tsx just labels a raw-text/code viewer — neither
 * renders markdown to formatted output. Per the fix brief, this adds minimal
 * safe parsing rather than a new dependency for one feature.
 *
 * Safety: every construct becomes a typed React element or a plain text
 * node — never `dangerouslySetInnerHTML`, never a raw-HTML pass-through. A
 * reply that happens to contain literal `<script>` or other tag-looking text
 * renders as an inert text string, exactly like any other React children.
 * Unrecognized syntax (headers, links, code spans, etc.) is intentionally
 * left as plain text rather than guessed at.
 */

const BOLD_SPLIT_RE = /(\*\*[^*\n]+\*\*)/g;
const BULLET_RE = /^[-*]\s+(.*)$/;
const NUMBERED_RE = /^\d+\.\s+(.*)$/;

/** Split a single line on `**bold**` spans; everything else is plain text. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split(BOLD_SPLIT_RE)
    .filter((part) => part !== '')
    .map((part, i) => {
      if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) {
        return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
      }
      return <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>;
    });
}

export function ChatMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let ordered = false;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const blockIndex = blocks.length;
    blocks.push(
      <p key={`p-${blockIndex}`}>
        {paragraph.map((line, i) => (
          <Fragment key={i}>
            {i > 0 && <br />}
            {renderInline(line, `p${blockIndex}-${i}`)}
          </Fragment>
        ))}
      </p>,
    );
    paragraph = [];
  };

  const flushList = () => {
    if (list.length === 0) return;
    const blockIndex = blocks.length;
    const items = list.map((item, i) => (
      <li key={i}>{renderInline(item, `li${blockIndex}-${i}`)}</li>
    ));
    blocks.push(
      ordered ? (
        <ol key={`l-${blockIndex}`} className="list-decimal pl-5 space-y-0.5">
          {items}
        </ol>
      ) : (
        <ul key={`l-${blockIndex}`} className="list-disc pl-5 space-y-0.5">
          {items}
        </ul>
      ),
    );
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }
    const bullet = BULLET_RE.exec(line);
    const numbered = bullet ? null : NUMBERED_RE.exec(line);
    if (bullet) {
      flushParagraph();
      if (list.length > 0 && ordered) flushList();
      ordered = false;
      list.push(bullet[1] ?? '');
      continue;
    }
    if (numbered) {
      flushParagraph();
      if (list.length > 0 && !ordered) flushList();
      ordered = true;
      list.push(numbered[1] ?? '');
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();

  return <div className="flex flex-col gap-2">{blocks}</div>;
}
