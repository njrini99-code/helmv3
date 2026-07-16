'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import type { College } from '@/lib/types';

interface UseCollegesOptions {
  division?: string;
  state?: string;
  conference?: string;
  search?: string;
}

// ── Non-production fixture filter ───────────────────────────────────────────
//
// THE GAP THIS CLOSES (visual-audit player-journey-colleges.md, [DISHONEST]):
// `organizations` filtered only to `type = 'college'` — with no exclusion of
// seed/E2E/QA fixture rows — so a real player's "Discover Colleges" catalog
// was majority (12 of 21 observed) test data: "Codex Demo College", "Codex
// Test College", "Demo University Golf", "E2E Test University", "QA Test
// University", "UI Test College 179805…", and a college literally named
// "Yes" located in "Yes, YA" ("YA" is not a real US state/territory code).
// `organizations` has no `is_test`/`source` column to filter on, so this
// combines two independently-defensible signals instead of a fragile single
// heuristic:
//   1. The name/conference itself matches a known seed/E2E/QA naming
//      convention (every fixture the audit found does).
//   2. `location_state` isn't a real two-letter US state/territory code
//      (catches "Yes, YA" — the one fixture with an otherwise-unremarkable
//      name).
// A real program only needs to clear BOTH checks; nothing here touches the
// underlying rows, so this is reversible and has zero blast radius on the DB.

const NON_PRODUCTION_NAME_PATTERNS: RegExp[] = [
  /codex/i,
  /\be2e\b/i,
  /\bqa test\b/i,
  /\bui test\b/i,
  /\btest college\b/i,
  /\bdemo university\b/i,
];

/** True if `name` matches a known seed/E2E/QA naming convention. */
export function isNonProductionOrgName(name: string | null | undefined): boolean {
  if (!name) return false;
  return NON_PRODUCTION_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

// Real US state + DC + territory postal codes. A college whose
// `location_state` isn't one of these is not a real recruitable program.
const VALID_US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL',
  'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT',
  'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC', 'PR', 'VI', 'GU', 'AS', 'MP',
]);

/** True if `state` is NOT a real US state/DC/territory postal code. */
export function isInvalidUsStateCode(state: string | null | undefined): boolean {
  if (!state) return false;
  return !VALID_US_STATE_CODES.has(state.trim().toUpperCase());
}

/** True if `org` looks like seed/E2E/QA fixture data, not a real program. */
export function isNonProductionOrg(org: {
  name?: string | null;
  location_state?: string | null;
}): boolean {
  return isNonProductionOrgName(org.name) || isInvalidUsStateCode(org.location_state);
}

export function useColleges(options: UseCollegesOptions = {}) {
  const [colleges, setColleges] = useState<College[]>([]);
  const [interests, setInterests] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuthStore();
  const supabase = createClient();

  const fetchColleges = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase.from('organizations').select('*').eq('type', 'college').order('name');

    if (options.division) {
      query = query.eq('division', options.division);
    }
    if (options.state) {
      query = query.eq('location_state', options.state);
    }
    if (options.conference) {
      query = query.ilike('conference', `%${options.conference}%`);
    }
    if (options.search) {
      query = query.or(`name.ilike.%${options.search}%,location_city.ilike.%${options.search}%,location_state.ilike.%${options.search}%`);
    }

    const { data, error: queryError } = await query;
    if (queryError) {
      setError(queryError.message);
      setColleges([]);
    } else {
      // Exclude seed/E2E/QA fixture rows — see isNonProductionOrg above.
      setColleges((data || []).filter((org) => !isNonProductionOrg(org)));
    }
    setLoading(false);
  }, [options.division, options.state, options.conference, options.search, supabase]);

  const fetchInterests = useCallback(async () => {
    if (!user) return;

    // Get player record
    const { data: player, error: playerError } = await supabase
      .from('baseball_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (playerError || !player) return;

    // Get interests - use organization_id to match against college id
    const { data: interestsData } = await supabase
      .from('baseball_recruiting_interests')
      .select('organization_id')
      .eq('player_id', player.id);

    if (interestsData) {
      const interestIds = new Set(interestsData.map(i => i.organization_id).filter(Boolean) as string[]);
      setInterests(interestIds);
    }
  }, [user, supabase]);

  useEffect(() => {
    fetchColleges();
  }, [fetchColleges]);

  useEffect(() => {
    fetchInterests();
  }, [fetchInterests]);

  const toggleInterest = (collegeId: string, isInterested: boolean) => {
    setInterests(prev => {
      const newSet = new Set(prev);
      if (isInterested) {
        newSet.add(collegeId);
      } else {
        newSet.delete(collegeId);
      }
      return newSet;
    });
  };

  return { colleges, interests, loading, error, refetch: fetchColleges, toggleInterest };
}

export function useStates() {
  const [states, setStates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchStates = useCallback(async () => {
    setLoading(true);
    setError(null);
    // States must reflect colleges that can actually be filtered on
    // (location_state on organizations), not player home states.
    const { data, error: queryError } = await supabase
      .from('organizations')
      .select('location_state')
      .eq('type', 'college')
      .not('location_state', 'is', null);

    if (queryError) {
      setError(queryError.message);
      setStates([]);
    } else if (data) {
      // Exclude fixture "states" (e.g. the "Yes, YA" seed row — "YA" isn't a
      // real US state/territory code) so the filter dropdown never offers a
      // state a real player can't actually be searching for.
      const statesArray = data
        .map(d => d.location_state)
        .filter((s): s is string => Boolean(s) && !isInvalidUsStateCode(s));
      const uniqueStates = Array.from(new Set(statesArray)).sort();
      setStates(uniqueStates);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchStates();
  }, [fetchStates]);

  return { states, loading, error, refetch: fetchStates };
}

export function useConferences() {
  const [conferences, setConferences] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchConferences = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from('organizations')
      .select('conference')
      .eq('type', 'college')
      .not('conference', 'is', null);

    if (queryError) {
      setError(queryError.message);
      setConferences([]);
    } else if (data) {
      // Exclude fixture conference names ("CODEX CON", "DEMO CONF", "E2E
      // TEST C…") — same naming-convention signal as isNonProductionOrgName,
      // applied to the conference string itself.
      const conferencesArray = data
        .map(d => d.conference)
        .filter((c): c is string => Boolean(c) && !isNonProductionOrgName(c));
      const uniqueConferences = Array.from(new Set(conferencesArray)).sort();
      setConferences(uniqueConferences);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchConferences();
  }, [fetchConferences]);

  return { conferences, loading, error, refetch: fetchConferences };
}
