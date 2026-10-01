'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RecruitInput } from '@/app/golf/actions/recruiting';
import {
  countByStage,
  fullName,
  isSort,
  isStage,
  newRequestId,
  prospectFrom,
  sharesOf,
  stageMeta,
  visibleProspects,
  type ChDraftField,
  type ChProspect,
  type ChRecruiting,
  type ChSort,
  type ChStage,
} from '../../data/recruiting-shape';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import { normalise, useAction } from '../../lib/use-action';
import { useChPhone } from '../../lib/use-phone';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import type { RecCtx, RecInitialUpload } from './ctx';
import { ProspectForm, type RecFormState } from './ProspectForm';
import { RecruitingDesktop } from './RecruitingDesktop';
import { RecruitingPhone } from './RecruitingPhone';
import { RecActionSheet } from './RecSheet';
import type { ChRecruitingWrites } from './writes';

const SORT_KEY = 'ch-recruiting-sort';
const STAGE_KEY = 'ch-recruiting-stage';

/** Where the page starts, for the preview and the tests. A live page starts from the browser's last sort and stage. */
export interface RecInitial {
  query?: string;
  stage?: ChStage | null;
  sort?: ChSort;
  /** The prospect open on desktop, and (with `detail`) on the phone. */
  openId?: string | null;
  detail?: boolean;
  form?: 'add' | 'edit';
  asking?: boolean;
  /** The upload dialog is open on this file when the open prospect's documents draw (the preview's upload and refusal states). */
  upload?: RecInitialUpload;
}

/**
 * Recruiting (P014) for the coach (owner boards in design/handoff/recruiting; behaviour is the current page's,
 * memory/features/recruiting.md; spec docs/clubhouse/phone/recruiting.md). The list as the server read it, the
 * pipeline, search and sort over it, and the open prospect; every change a coach can make.
 *
 * Every write goes through `useAction`, and everything a write changes on this screen happens inside the action,
 * so a toast's Retry finishes the job as well. A stage is saved the moment it is picked: the prospect moves at once
 * and goes back, with a Retry, if the save does not land (CH-14003). An add, an edit and a delete wait for the
 * server. The server revalidates the page after each write, so fresh props replace what this screen holds. When the server
 * refuses a write because the caller is not the team's coach (RLS), its sentence is the toast's reason (CH-14903).
 */
export function RecruitingView({ data, writes, initial }: { data: ChRecruiting; writes: ChRecruitingWrites; initial?: RecInitial }) {
  const router = useRouter();
  const toast = useToast();
  const phone = useChPhone();

  // The list as the page holds it (CH-14912). A refresh (Try again, or the page a write revalidated) brings new data, and it replaces what
  // this screen kept from the first render, so a retry after a failed read shows the prospects, never "your list starts here".
  const [prospects, setProspects] = useState(data.prospects);
  const [seen, setSeen] = useState(data.prospects);
  if (data.prospects !== seen) {
    setSeen(data.prospects);
    setProspects(data.prospects);
  }

  // Relative dates read the server's clock and the UTC calendar until the browser's own is known, so the first paint and hydration agree.
  const [now, setNow] = useState(() => new Date(data.now));
  const [tz, setTz] = useState<string | undefined>('UTC');
  // A preview or a test (`initial`) keeps the server's clock, so its dates never move with the calendar.
  const frozen = !!initial;
  useEffect(() => {
    if (frozen) return;
    setNow(new Date());
    setTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, [frozen]);

  const [query, setQuery] = useState(initial?.query ?? '');
  const [stage, setStageState] = useState<ChStage | null>(initial?.stage ?? null);
  const [sort, setSortState] = useState<ChSort>(initial?.sort ?? 'updated');
  // The last sort and stage are a per-browser convenience, not account state (the current page keeps them the same way).
  useEffect(() => {
    if (initial) return;
    try {
      const s = localStorage.getItem(SORT_KEY);
      if (isSort(s)) setSortState(s);
      const f = localStorage.getItem(STAGE_KEY);
      if (isStage(f)) setStageState(f);
    } catch {
      /* private mode: the defaults are fine */
    }
  }, [initial]);
  const setSort = (s: ChSort) => {
    setSortState(s);
    try {
      localStorage.setItem(SORT_KEY, s);
    } catch {
      /* not persisted; still sorts */
    }
  };
  const setStage = (s: ChStage | null) => {
    setStageState(s);
    try {
      if (s) localStorage.setItem(STAGE_KEY, s);
      else localStorage.removeItem(STAGE_KEY);
    } catch {
      /* not persisted; still filters */
    }
  };

  const counts = useMemo(() => countByStage(prospects), [prospects]);
  const shares = useMemo(() => sharesOf(counts), [counts]);
  const rows = useMemo(() => visibleProspects(prospects, { stage, query, sort }), [prospects, stage, query, sort]);

  // Desktop: the open prospect stays open while a search or stage hides it, and the first one shows until another is picked.
  // Phone: the detail is a pushed screen and opens only when a prospect is tapped.
  const [selectedId, setSelectedId] = useState<string | null>(initial?.openId ?? null);
  const [detailId, setDetailId] = useState<string | null>(initial?.detail ? (initial.openId ?? null) : null);
  const byId = (id: string | null) => (id ? prospects.find((p) => p.id === id) ?? null : null);
  const open = phone ? byId(detailId) : (byId(selectedId) ?? rows[0] ?? null);

  const [form, setForm] = useState<RecFormState | null>(() => {
    const p = initial?.openId ? (data.prospects.find((x) => x.id === initial.openId) ?? null) : null;
    return initial?.form ? { mode: initial.form, prospect: initial.form === 'edit' ? p : null, nonce: 1 } : null;
  });
  const formCount = useRef(1);
  const [asking, setAsking] = useState<ChProspect | null>(() => (initial?.asking && initial.openId ? (data.prospects.find((x) => x.id === initial.openId) ?? null) : null));
  const [announce, setAnnounce] = useState<{ code: string; text: string } | null>(null);

  /** A prospect the search or the stage would hide is never left out of sight after a save. */
  const reveal = (p: ChProspect) => {
    if (!visibleProspects([p], { stage, query, sort }).length) {
      setQuery('');
      setStage(null);
    }
  };

  // ── Add a prospect (CH-14001) ──────────────────────────────────────────────
  // One request id per Add: the same form with the same contents sends the same id, whether Retry replays it or Save is pressed again, so a
  // reply that was lost after the server stored the prospect cannot add them a second time (CH-14915). Changing the contents is a
  // different prospect and gets a new id.
  const attempt = useRef<{ nonce: number; sig: string; id: string } | null>(null);
  const requestIdFor = (f: RecFormState, input: RecruitInput) => {
    const sig = JSON.stringify(input);
    const last = attempt.current;
    if (last && last.nonce === f.nonce && last.sig === sig) return last.id;
    const id = newRequestId();
    attempt.current = { nonce: f.nonce, sig, id };
    return id;
  };
  const addAction = async (input: RecruitInput, requestId: string) => {
    const res = await writes.create(input, requestId);
    const r = normalise(res);
    if (r.success && r.data?.id) {
      const at = new Date().toISOString();
      const p = prospectFrom(r.data.id, input, { createdAt: at, updatedAt: at });
      setProspects((prev) => [p, ...prev.filter((x) => x.id !== p.id)]);
      reveal(p);
      setSelectedId(p.id);
      setDetailId(p.id);
      setForm(null);
      toast({ title: `${p.name} added`, code: 'CH-14905' });
    }
    return res;
  };
  const add = useAction('recruiting.add', addAction, (input: RecruitInput) => ({
    done: '',
    failed: `Couldn't add ${fullName(input.first_name, input.last_name)}`,
    hint: 'Nothing was added. Check your connection and try again.',
    code: 'CH-14001',
  }));

  // ── Save changes to a prospect (CH-14002) ──────────────────────────────────
  const saveAction = async (p: ChProspect, input: RecruitInput) => {
    const res = await writes.update(p.id, input);
    if (normalise(res).success) {
      const at = new Date().toISOString();
      const next = prospectFrom(p.id, input, { createdAt: p.createdAt, updatedAt: at });
      setProspects((prev) => prev.map((x) => (x.id === p.id ? next : x)));
      reveal(next);
      setForm(null);
      toast({ title: `${next.name} saved`, code: 'CH-14906' });
    }
    return res;
  };
  const save = useAction('recruiting.save', saveAction, (p: ChProspect) => ({
    done: '',
    failed: `Couldn't save ${p.name}'s changes`,
    hint: 'Nothing was changed. Check your connection and try again.',
    code: 'CH-14002',
  }));

  // ── Move a prospect to another stage (CH-14003, optimistic: CH-14909) ──────
  // The prospect moves before the save, and the move is undone inside this action if the save does not land, so the toast's Retry
  // (which runs it again with the same prospect) applies it again and undoes it again. Offline, `useAction` refuses before this runs
  // (CH-14901, with the shell's CH-1903 toast), so nothing has moved and there is nothing to undo.
  const moveAction = async (p: ChProspect, to: ChStage) => {
    const put = (stageNow: ChStage, updatedAt: string) => setProspects((prev) => prev.map((x) => (x.id === p.id ? { ...x, stage: stageNow, updatedAt } : x)));
    put(to, new Date().toISOString());
    let res: Awaited<ReturnType<ChRecruitingWrites['update']>>;
    try {
      res = await writes.update(p.id, { status: to });
    } catch (err) {
      put(p.stage, p.updatedAt);
      throw err;
    }
    if (normalise(res).success) setAnnounce({ code: 'CH-14803', text: `${p.name} is now ${stageMeta(to).label}` });
    else put(p.stage, p.updatedAt);
    return res;
  };
  const move = useAction('recruiting.stage', moveAction, (p: ChProspect, to: ChStage) => ({
    done: '',
    failed: `Couldn't move ${p.name} to ${stageMeta(to).label}`,
    hint: `${p.name} is still ${stageMeta(p.stage).label}. Try again.`,
    code: 'CH-14003',
  }));

  // ── Delete a prospect (CH-14004) ───────────────────────────────────────────
  const deleteAction = async (p: ChProspect) => {
    const res = await writes.remove(p.id);
    if (normalise(res).success) {
      setProspects((prev) => prev.filter((x) => x.id !== p.id));
      setSelectedId((id) => (id === p.id ? null : id));
      setDetailId((id) => (id === p.id ? null : id));
      setAsking(null);
      setForm(null);
      toast({ title: `${p.name} deleted`, code: 'CH-14907' });
    }
    return res;
  };
  const del = useAction('recruiting.delete', deleteAction, (p: ChProspect) => ({
    done: '',
    failed: `Couldn't delete ${p.name}`,
    hint: 'Nothing was deleted. Check your connection and try again.',
    code: 'CH-14004',
  }));

  const ctx: RecCtx = {
    writes,
    prospects,
    rows,
    counts,
    shares,
    total: prospects.length,
    query,
    setQuery,
    stage,
    setStage,
    sort,
    setSort,
    open,
    select: (id) => {
      chTrail('recruiting open');
      haptic('select');
      if (phone) setDetailId(id);
      else setSelectedId(id);
    },
    closeDetail: () => setDetailId(null),
    now,
    tz,
    moveStage: (p, to) => {
      if (p.stage === to) return;
      chTrail('recruiting stage');
      void move.run(p, to);
    },
    startAdd: () => {
      chTrail('recruiting add');
      setForm({ mode: 'add', prospect: null, nonce: ++formCount.current });
    },
    startEdit: (p: ChProspect, focus?: ChDraftField) => {
      chTrail('recruiting edit');
      setForm({ mode: 'edit', prospect: p, focus, nonce: ++formCount.current });
    },
    askDelete: (p) => {
      // CH-14702: a warning, before the question.
      haptic('warning');
      setAsking(p);
    },
    // CH-14911: Try again asks the server for the list again.
    tryAgain: () => router.refresh(),
    error: data.error,
    initialUpload: initial?.upload,
  };

  return (
    <>
      {phone ? <RecruitingPhone c={ctx} /> : <RecruitingDesktop c={ctx} />}
      <ProspectForm
        form={form}
        phone={phone}
        saving={add.pending || save.pending}
        onClose={() => setForm(null)}
        onDelete={ctx.askDelete}
        onSave={(input, f) => void (f.mode === 'add' || !f.prospect ? add.run(input, requestIdFor(f, input)) : save.run(f.prospect, input))}
      />
      {phone ? (
        <RecActionSheet
          open={!!asking}
          onClose={() => setAsking(null)}
          code="CH-14501"
          title={asking ? `Delete ${asking.name}?` : 'Delete prospect?'}
          message="This removes them from your list, with their notes and documents. This can't be undone."
          actionLabel={del.pending ? 'Deleting' : 'Delete prospect'}
          busy={del.pending}
          onAction={() => asking && void del.run(asking)}
        />
      ) : (
        <Modal
          open={!!asking}
          onClose={() => !del.pending && setAsking(null)}
          width={460}
          icon={Trash2}
          code="CH-14501"
          title={asking ? `Delete ${asking.name}?` : 'Delete prospect?'}
          description="This removes them from your list, with their notes and documents. This can't be undone."
          footer={
            <>
              <Button variant="ghost" disabled={del.pending} onClick={() => setAsking(null)}>
                Keep them
              </Button>
              <Button variant="danger" disabled={del.pending} feel="warning" onClick={() => asking && void del.run(asking)}>
                {del.pending ? <span data-ch-code="CH-14406">Deleting</span> : 'Delete prospect'}
              </Button>
            </>
          }
        />
      )}
      {/* A stage that saved says so for a screen reader; the control's new position is the confirmation on screen. */}
      <p className="ch-sr-only" role="status" aria-live="polite" data-ch-code={announce?.code}>
        {announce?.text}
      </p>
    </>
  );
}
