import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT_LAYOUT = resolve(__dirname, '../../app/layout.tsx');
const DASHBOARD_LAYOUT = resolve(__dirname, '../../app/golf/(dashboard)/layout.tsx');
// The dashboard's shell: Clubhouse is the only coach and player UI (Fairway retired, 2026-11-14).
const DASHBOARD_SHELL = resolve(__dirname, '../../clubhouse/shell/ClubhouseShell.tsx');

describe('GolfHelm theme script placement (#1044)', () => {
  it('renders ThemeScript in the root document head', () => {
    const source = readFileSync(ROOT_LAYOUT, 'utf8');
    const head = source.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';

    expect(source).toContain("import { ThemeScript } from '@/components/theme/ThemeScript'");
    expect(head).toContain('<ThemeScript />');
  });

  it('does not render a raw script from the nested dashboard layout', () => {
    const source = readFileSync(DASHBOARD_LAYOUT, 'utf8');

    expect(source).not.toContain("from '@/components/theme/ThemeScript'");
    expect(source).not.toContain('<ThemeScript');
    const shell = readFileSync(DASHBOARD_SHELL, 'utf8');
    expect(shell).not.toContain('<ThemeScript');
    expect(shell).toContain('<ThemeApplier />');
  });
});
