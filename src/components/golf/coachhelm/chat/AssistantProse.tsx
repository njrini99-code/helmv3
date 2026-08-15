'use client';

/**
 * ============================================================================
 * CoachHelm · chat · assistant prose
 * ----------------------------------------------------------------------------
 * The text renderer. Editorial, not a chat bubble.
 *
 * Scope is deliberately narrow. The previous renderer tried to be a small
 * Markdown engine and got the usual results — a stray asterisk in a course name
 * turned half a paragraph italic, and tables the model emitted rendered as
 * pipe-soup. Charts and tables now arrive as typed data parts drawn from tool
 * output, so the text only has to handle what genuinely helps a coach read:
 * paragraphs, lists, bold emphasis, and player names.
 *
 * Player names render as green inline pills that link to the player's page.
 * The match is against the ACTUAL roster passed in, not a regex guessing at
 * capitalised words — "Wake Forest" is not a player, and a renderer that thinks
 * it might be will eventually make a link that goes nowhere.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface AssistantProseProps {
  text: string;
  /** Roster display name → player id. Only these become links. */
  playersByName?: Record<string, string>;
  /**
   * The opening block of a turn — the takeaway.
   *
   * Set one step larger than the body that follows it. Every paragraph at the
   * same size made a six-paragraph answer a uniform slab with no way in; the
   * first sentence is the one a coach reads to decide whether to read the rest,
   * so it gets the weight. Purely typographic — no colour, no box, and the
   * paragraph is the same element either way.
   */
  lead?: boolean;
  className?: string;
}

export function AssistantProse({
  text,
  playersByName,
  lead = false,
  className,
}: AssistantProseProps) {
  const blocks = React.useMemo(() => parseBlocks(text), [text]);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {blocks.map((block, i) => {
        if (block.kind === 'list') {
          return (
            <ul key={i} className="flex flex-col gap-1.5 pl-1">
              {block.items.map((item, j) => (
                <li key={j} className="flex gap-2.5">
                  <span aria-hidden className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-text-tertiary" />
                  <span className="font-fw-sans text-body text-text-primary [text-wrap:pretty]">
                    <Inline text={item} playersByName={playersByName} />
                  </span>
                </li>
              ))}
            </ul>
          );
        }
        // Only the FIRST paragraph of a lead block is the takeaway — a lead
        // text part that runs to four paragraphs is an answer, not a headline.
        const isTakeaway = lead && i === 0;
        return (
          <p
            key={i}
            className={cn(
              'font-fw-sans text-text-primary [text-wrap:pretty]',
              isTakeaway ? 'text-body-lg leading-[1.55]' : 'text-body leading-[1.65]',
            )}
          >
            <Inline text={block.text} playersByName={playersByName} />
          </p>
        );
      })}
    </div>
  );
}

type Block = { kind: 'paragraph'; text: string } | { kind: 'list'; items: string[] };

/**
 * Split into paragraphs and lists.
 *
 * Headings are intentionally NOT supported. The assistant is instructed not to
 * head a two-sentence answer, and rendering `##` as a heading rewards it for
 * doing so — the surest way to get a wall of sections is to make sections look
 * good.
 */
function parseBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', text: paragraph.join(' ').trim() });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ kind: 'list', items: list });
      list = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1] ?? '');
      continue;
    }
    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    // Strip a leading heading marker rather than honouring it.
    paragraph.push(line.replace(/^#{1,6}\s*/, ''));
  }
  flushParagraph();
  flushList();
  return blocks;
}

/**
 * Inline formatting: bold, and player mentions.
 *
 * Bold is handled first so `**Nick**` still yields a mention inside the strong
 * element. Everything else — italics especially — is left as literal text: a
 * single asterisk is far more often punctuation in a coach's world than it is
 * markup, and getting that wrong is visible and silly.
 */
function Inline({
  text,
  playersByName,
}: {
  text: string;
  playersByName?: Record<string, string>;
}) {
  const segments = splitBold(text);
  return (
    <>
      {segments.map((seg, i) =>
        seg.bold ? (
          <strong key={i} className="font-semibold text-text-primary">
            <Mentions text={seg.text} playersByName={playersByName} />
          </strong>
        ) : (
          <Mentions key={i} text={seg.text} playersByName={playersByName} />
        ),
      )}
    </>
  );
}

function splitBold(text: string): { text: string; bold: boolean }[] {
  const out: { text: string; bold: boolean }[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ text: text.slice(last, start), bold: false });
    out.push({ text: m[1] ?? '', bold: true });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out.length > 0 ? out : [{ text, bold: false }];
}

/**
 * Turn roster names into links.
 *
 * Longest name first, so "Nick Rini" wins over a bare "Nick" and the two do not
 * produce overlapping matches. Word boundaries on both ends, so "Nicky" is not
 * a mention of Nick.
 */
function Mentions({
  text,
  playersByName,
}: {
  text: string;
  playersByName?: Record<string, string>;
}) {
  const names = React.useMemo(
    () => Object.keys(playersByName ?? {}).sort((a, b) => b.length - a.length),
    [playersByName],
  );
  if (names.length === 0 || !text) return <>{text}</>;

  const pattern = new RegExp(`\\b(${names.map(escapeRegex).join('|')})\\b`, 'g');
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const m of text.matchAll(pattern)) {
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const name = m[0];
    const id = playersByName?.[name];
    out.push(
      id ? (
        <Link
          key={(key += 1)}
          href={`/golf/dashboard/players/${id}/game`}
          // A roster answer names seven players. Rendered as `text-accent-700`
          // with a green underline, that put seven green links in a seven-line
          // list — the answer read as a navigation menu, and the accent stopped
          // marking anything because it was on every proper noun.
          //
          // A player's name keeps the ink of the sentence it is in, and carries
          // a hairline rule to say it is reachable. The accent arrives on hover
          // and focus, where it is doing work: confirming what is about to be
          // clicked. No `px-0.5` either — horizontal padding on an inline link
          // widens the word and breaks the spacing of the prose around it.
          className={cn(
            'font-medium text-text-primary underline decoration-border-strong',
            'underline-offset-[3px] decoration-1',
            'transition-colors hover:text-fw-success-ink hover:decoration-accent-600',
            'rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1',
          )}
        >
          {name}
        </Link>
      ) : (
        name
      ),
    );
    last = start + name.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
