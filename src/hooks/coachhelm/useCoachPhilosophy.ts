'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fromUntyped } from '@/lib/supabase/untyped';
import { CoachPhilosophy } from '@/lib/coachhelm/types';
import { PHILOSOPHY_DEFAULTS } from '@/lib/coachhelm/constants';
import { dbToTs, tsToDb, type PhilosophyDbRow } from '@/lib/coachhelm/philosophy-map';
import { revalidateCoachingPhilosophyPaths } from '@/app/golf/actions/coaching-philosophy';

interface SaveCoachPhilosophyOptions {
    revalidate?: boolean;
}

export function useCoachPhilosophy(coachId: string | null) {
    const [philosophy, setPhilosophy] = useState<CoachPhilosophy | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const supabaseRef = useRef(createClient());
    // DATA-11 — every save() takes a ticket, and every field it patches is
    // stamped with that ticket. A response may only write back the fields it
    // still owns (no newer save has claimed them). Two quick edits can resolve
    // out of order, and their UPDATEs can even commit in the opposite order,
    // so applying a whole returned row would let one save's stale copy of
    // another save's field overwrite the newer value — visibly reverting the
    // coach's edit while the database holds it. Per-field ownership merges
    // each response's own fields only. This orders client state; the
    // database applies each partial UPDATE in arrival order.
    const saveSeqRef = useRef(0);
    const fieldSeqRef = useRef(new Map<keyof CoachPhilosophy, number>());

    // Fetch on mount
    useEffect(() => {
        if (!coachId) {
            setLoading(false);
            return;
        }

        // Capture coachId for closure (TypeScript narrowing)
        const currentCoachId = coachId;

        async function fetchPhilosophy() {
            setLoading(true);
            setError(null);

            const { data, error: fetchError } = await supabaseRef.current
                .from('golf_coach_philosophy')
                .select('*')
                .eq('coach_id', currentCoachId)
                .maybeSingle();

            if (fetchError) {
                setError(fetchError.message);
                setLoading(false);
                return;
            }

            if (data) {
                setPhilosophy(dbToTs(data as unknown as PhilosophyDbRow));
            } else {
                // Create default record if none exists
                const { data: newData, error: createError } = await supabaseRef.current
                    .from('golf_coach_philosophy')
                    .insert({
                        coach_id: currentCoachId,
                        // Use defaults for initial creation (postgres defaults handle this largely, but explicit here for clarity)
                        priority_ball_striking: PHILOSOPHY_DEFAULTS.priorityBallStriking,
                        priority_short_game: PHILOSOPHY_DEFAULTS.priorityShortGame,
                        priority_putting: PHILOSOPHY_DEFAULTS.priorityPutting,
                        priority_course_management: PHILOSOPHY_DEFAULTS.priorityCourseManagement,
                        priority_mental_game: PHILOSOPHY_DEFAULTS.priorityMentalGame,
                    })
                    .select()
                    .single();

                if (createError) {
                    setError(createError.message);
                } else if (newData) {
                    setPhilosophy(dbToTs(newData as unknown as PhilosophyDbRow));
                }
            }

            setLoading(false);
        }

        fetchPhilosophy();
    }, [coachId]);

    // Save changes
    const save = useCallback(
        async (updates: Partial<CoachPhilosophy>, options: SaveCoachPhilosophyOptions = {}) => {
            if (!philosophy?.id) return false;

            const seq = ++saveSeqRef.current;
            const isLatest = () => seq === saveSeqRef.current;
            const patchedKeys = Object.keys(updates) as Array<keyof CoachPhilosophy>;
            for (const key of patchedKeys) fieldSeqRef.current.set(key, seq);

            setSaving(true);
            setError(null);

            const { data, error: updateError } = await fromUntyped(supabaseRef.current, 'golf_coach_philosophy')
                .update(tsToDb(updates))
                .eq('id', philosophy.id)
                .select()
                .single();

            if (updateError) {
                // Always surface a failure, even from a superseded save: its
                // patch may touch different fields than the newer one, and a
                // failed write must never be silent.
                setError(updateError.message);
                if (isLatest()) setSaving(false);
                return false;
            }

            const row = dbToTs(data as unknown as PhilosophyDbRow);
            const ownedKeys = patchedKeys.filter((key) => fieldSeqRef.current.get(key) === seq);
            const latest = isLatest();
            setPhilosophy((prev) => {
                if (!prev) return row;
                const next: Record<string, unknown> = { ...prev };
                for (const key of ownedKeys) next[key] = row[key];
                if (latest) next.updatedAt = row.updatedAt;
                return next as unknown as CoachPhilosophy;
            });
            if (options.revalidate) {
                await revalidateCoachingPhilosophyPaths();
            }
            if (isLatest()) setSaving(false);
            return true;
        },
        [philosophy?.id]
    );

    return { philosophy, loading, saving, error, save };
}
