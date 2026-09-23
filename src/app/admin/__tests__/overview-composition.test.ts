/**
 * OVERVIEW COMPOSITION — pins that the Phase 2 -> 3 Command Deck migration
 * (bridge redesign plan §2) actually finished, and stays finished.
 *
 * `AdminOverviewPage` is an async server component that hits Supabase, so
 * (like every other Bridge route) nothing renders it in a unit test — this
 * is a source-pin over the raw file text, the same style
 * `nav-covers-every-route.test.ts` already uses for `AdminShell.tsx`.
 *
 * WHY THIS DOES NOT ASSERT A LITERAL "SIX aria-labelled sections" LIST.
 * `PanelBoundary`'s success-path render is `return this.props.children` —
 * it wraps NOTHING in an aria-labelled element unless its subtree already
 * has one, so `<PanelBoundary title="Helm Command Deck">` gives the Deck no
 * DOM `aria-label` at all. The Deck's own five real `aria-label`s
 * ("Helm System Orbit", "Attention stack", "Decision inbox", "Release wake",
 * "Self-heal circuit") live in `CommandDeck.tsx`'s own JSX, never in
 * `page.tsx`'s source. Pinning a fabricated 6-item list here — inventing
 * labels page.tsx does not contain just to make a count match the plan's
 * prose — would be exactly the "padded test to turn it green" failure this
 * kind of check exists to prevent. So this test pins two separate, true
 * things instead: (1) `page.tsx` renders the Deck first, then exactly the
 * three sections it does NOT compute, in order, each a real DOM
 * `aria-label`; (2) `CommandDeck.tsx` still carries its own five real
 * `aria-label`s, in order. Together that is the composition the plan
 * describes — read honestly, from two files, rather than asserted as one
 * invented list.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PAGE_PATH = path.join(process.cwd(), 'src/app/admin/page.tsx');
const DECK_PATH = path.join(process.cwd(), 'src/components/admin/command-deck/CommandDeck.tsx');

const pageSource = fs.readFileSync(PAGE_PATH, 'utf8');
const deckSource = fs.readFileSync(DECK_PATH, 'utf8');

/** Every `aria-label="..."` literal in a file, in source order. Deliberately
 *  a plain string scan (like `nav-covers-every-route.test.ts`'s checks), not
 *  a JSX parse — this file's whole point is reading the same bytes that ship. */
function ariaLabelsIn(source: string): string[] {
  return [...source.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]!);
}

describe('Overview composition (bridge redesign plan §2)', () => {
  it('renders the Command Deck, then exactly the three sections it does not compute, in order', () => {
    expect(ariaLabelsIn(pageSource)).toEqual(['Platform KPIs', 'Feature command map', 'Change timeline']);
  });

  it('mounts <CommandDeck /> before any of its own three sections', () => {
    const deckIndex = pageSource.indexOf('<CommandDeck');
    expect(deckIndex).toBeGreaterThan(-1);
    for (const label of ['Platform KPIs', 'Feature command map', 'Change timeline']) {
      const sectionIndex = pageSource.indexOf(`aria-label="${label}"`);
      expect(sectionIndex, `${label} section not found after <CommandDeck />`).toBeGreaterThan(deckIndex);
    }
  });

  it('the Command Deck itself still carries its five own aria-labelled sections, in order', () => {
    expect(ariaLabelsIn(deckSource)).toEqual([
      'Helm System Orbit',
      'Attention stack',
      'Decision inbox',
      'Release wake',
      'Self-heal circuit',
    ]);
  });

  it('imports none of the eleven components the Phase 2 -> 3 migration deleted', () => {
    // Every name below used to be imported by page.tsx and rendered as its
    // own panel — a second or third copy of a computation CommandDeck.tsx
    // already makes, or a lens one click away. Deleted per plan §2.1.
    const deletedIdentifiers = [
      'AdminStatusBanner',
      'SeverityMixStrip',
      'bucketSeverityMix',
      'PostureDisclosure',
      'TriageQueue',
      'ADMIN_COMMAND_SHORTCUTS',
      'TruthStrip',
      'buildTruthStrip',
      'canClaimAllClear',
      'cachedDeployFreshness',
      'cachedSelfHealBoard',
      'cachedBriefing',
      'AttentionQueue',
      'selectAttention',
      'SelfHealFlowStrip',
      'summarizeFlow',
      'fetchVercelDeployments',
    ];
    const importLines = pageSource
      .split('\n')
      .filter((line) => /^\s*import\b/.test(line))
      .join('\n');
    for (const name of deletedIdentifiers) {
      expect(importLines.includes(name), `page.tsx still imports ${name}`).toBe(false);
    }
  });

  it('deletes CommandHeader and the bottom command-shortcut row', () => {
    expect(pageSource).not.toContain('function CommandHeader');
    expect(pageSource).not.toContain('<CommandHeader');
    expect(pageSource).not.toContain('Command shortcuts');
  });

  it('deletes the PostureDisclosure wrapper and the panels it used to collapse', () => {
    expect(pageSource).not.toContain('<PostureDisclosure');
    expect(pageSource).not.toContain('function DeployRail');
    expect(pageSource).not.toContain('function SavedCommandViews');
    expect(pageSource).not.toContain('function SignalBoard');
    expect(pageSource).not.toContain('function TriagePanel');
    expect(pageSource).not.toContain('function MissionTruthStrip');
    expect(pageSource).not.toContain('function SelfHealFlowPanel');
    expect(pageSource).not.toContain('function ProofDebt');
    expect(pageSource).not.toContain('function AttentionPanel');
  });

  it('the deleted component source files are gone from the tree', () => {
    const deletedFiles = [
      'src/app/admin/_components/PostureDisclosure.tsx',
      'src/app/admin/_components/AttentionQueue.tsx',
      'src/app/admin/_components/SeverityMixStrip.tsx',
      'src/app/admin/_components/AdminStatusBanner.tsx',
      'src/app/admin/_components/TriageQueue.tsx',
    ];
    for (const rel of deletedFiles) {
      expect(fs.existsSync(path.join(process.cwd(), rel)), `${rel} should be deleted`).toBe(false);
    }
  });

  it('the Attention Stack limit is 8, not the pre-migration 5', () => {
    expect(deckSource).toMatch(/ATTENTION_STACK_LIMIT\s*=\s*8/);
  });

  it('the Command Deck folds in the blindness beacon and a proof-debt chip', () => {
    expect(deckSource).toContain('BlindnessBeacon');
    expect(deckSource).toContain('proofDebt');
  });
});
