import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs helper, scripts/ is outside tsconfig.
import { cliGuard, dryRunClient, formatHelp, helpOnly, parseCli, skipWrite } from '../cli-guard.mjs';

const spec = { name: 'scripts/x.mjs', summary: 'Does a thing to production.', usage: '[size]', options: [['--verbose', 'Say more']] };

class Exit extends Error {
  constructor(public code: number) {
    super(`exit ${code}`);
  }
}
const io = (argv: string[]) => {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: {
      argv,
      out: (s: string) => out.push(s),
      err: (s: string) => err.push(s),
      exit: (code: number): never => {
        throw new Exit(code);
      },
    },
  };
};

describe('parseCli', () => {
  it('defaults a writing script to a dry run', () => {
    const r = parseCli([], spec);
    expect(r).toMatchObject({ apply: false, dryRun: true, help: false, error: null });
  });

  it('applies only on an explicit --apply', () => {
    expect(parseCli(['--apply'], spec)).toMatchObject({ apply: true, dryRun: false });
    expect(parseCli(['10', '--apply'], spec).positional).toEqual(['10']);
  });

  it('rejects --apply together with --dry-run and does not apply', () => {
    const r = parseCli(['--apply', '--dry-run'], spec);
    expect(r.apply).toBe(false);
    expect(r.error).toMatch(/contradict/);
  });

  it('never applies for a read-only spec, even with --apply', () => {
    const r = parseCli(['--apply'], { ...spec, writes: false });
    expect(r).toMatchObject({ apply: false, dryRun: false });
  });

  it('recognises -h and --help', () => {
    expect(parseCli(['-h'], spec).help).toBe(true);
    expect(parseCli(['--help'], spec).help).toBe(true);
  });
});

describe('formatHelp', () => {
  it('states the dry-run default and the --apply flag for a writing script', () => {
    const text = formatHelp(spec);
    expect(text).toContain('Usage: scripts/x.mjs [size] [--apply]');
    expect(text).toContain('DRY RUN');
    expect(text).toContain('--verbose');
  });

  it('says read-only for a read-only script and names an existing guard otherwise', () => {
    expect(formatHelp({ ...spec, writes: false })).toContain('Read-only');
    expect(formatHelp({ ...spec, writes: false, guard: '--confirm' })).toContain('Writes are gated by: --confirm');
    expect(formatHelp({ ...spec, writes: false })).not.toContain('--apply');
  });
});

describe('cliGuard', () => {
  it('prints help and exits 0 without returning', () => {
    const t = io(['--help']);
    expect(() => cliGuard(spec, t.io)).toThrow(new Exit(0));
    expect(t.out.join('\n')).toContain('Does a thing to production.');
  });

  it('exits 2 on contradictory flags', () => {
    const t = io(['--apply', '--dry-run']);
    expect(() => cliGuard(spec, t.io)).toThrow(new Exit(2));
    expect(t.err[0]).toMatch(/contradict/);
  });

  it('helpOnly never exposes apply', () => {
    expect(helpOnly(spec, io(['--apply']).io).apply).toBe(false);
  });
});

describe('skipWrite', () => {
  it('logs and returns true on a dry run, silently false on --apply', () => {
    const lines: string[] = [];
    expect(skipWrite({ apply: false }, 'send 10 emails', (s: string) => lines.push(s))).toBe(true);
    expect(lines[0]).toContain('[dry-run] would send 10 emails');
    expect(skipWrite({ apply: true }, 'send 10 emails', (s: string) => lines.push(s))).toBe(false);
    expect(lines).toHaveLength(1);
  });
});

describe('dryRunClient', () => {
  /** A fake supabase-js client that records every call that would reach the network. */
  const makeClient = () => {
    const network: string[] = [];
    const builder = (table: string) => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        insert: () => {
          network.push(`insert ${table}`);
          return b;
        },
        update: () => {
          network.push(`update ${table}`);
          return b;
        },
        then: (resolve: (v: unknown) => void) => resolve({ data: [{ id: 'real' }], error: null }),
      };
      return b;
    };
    const client = {
      from: builder,
      rpc: () => {
        network.push('rpc');
        return Promise.resolve({ data: null, error: null });
      },
      auth: {
        admin: {
          createUser: async () => {
            network.push('createUser');
            return { data: { user: { id: 'real' } }, error: null };
          },
          listUsers: async () => ({ data: { users: [] }, error: null }),
        },
      },
      storage: {
        from: () => ({
          upload: async () => {
            network.push('upload');
            return { data: null, error: null };
          },
          getPublicUrl: () => ({ data: { publicUrl: 'https://x/y' } }),
        }),
      },
    };
    return { client, network };
  };

  it('returns the client untouched when --apply is set', () => {
    const { client } = makeClient();
    expect(dryRunClient(client, { apply: true })).toBe(client);
  });

  it('passes reads through and resolves writes without touching the network', async () => {
    const { client, network } = makeClient();
    const logs: string[] = [];
    const safe = dryRunClient(client, { apply: false }, (s: string) => logs.push(s));

    const read = await safe.from('crm_coaches').select('id').eq('id', 1);
    expect(read).toEqual({ data: [{ id: 'real' }], error: null });

    const inserted = await safe.from('crm_sequences').insert({ name: 'a' }).select('id').single();
    expect(inserted.error).toBeNull();
    expect(inserted.data).toMatchObject({ id: 'dry-run-crm_sequences-1', name: 'a' });

    const many = await safe.from('crm_sequence_enrollments').insert([{ a: 1 }, { a: 2 }]);
    expect(many.data).toHaveLength(2);

    await safe.from('crm_coaches').update({ status: 'x' }).eq('id', 1);
    await safe.rpc('some_fn');
    const created = await safe.auth.admin.createUser({ email: 'a@b.c' });
    expect(created.data.user.id).toBe('dry-run-user');
    await safe.storage.from('bucket').upload('p.png', new Uint8Array());

    expect(network).toEqual([]);
    expect(safe.storage.from('bucket').getPublicUrl('p.png').data.publicUrl).toBe('https://x/y');
    expect((await safe.auth.admin.listUsers()).data.users).toEqual([]);
    expect(logs.join('\n')).toContain('[dry-run] would insert 1 row(s) into crm_sequences');
    expect(logs.join('\n')).toContain('would update 1 row(s) in crm_coaches');
    expect(logs.join('\n')).toContain('would call rpc some_fn');
    expect(logs.join('\n')).toContain('would call auth.admin.createUser for a@b.c');
  });
});
