'use client';

import { useEffect, useRef, useState } from 'react';
import { SHARE_COPY } from '../../../live/copy';
import type { LiveRoundType, LiveShare } from '../../../live/model';
import { floorShare, shareControl, shareOptions } from '../../../live/share';
import type { LiveSharePorts } from '../../../live/share-ports';
import { Segmented } from '../../../ui/Segmented';
import { Switch } from '../../../ui/Switch';
import '../../../styles/live.css';

/** Tournament rounds have no control: coaches see them. No catalog code (a plain statement, not a state). */
const TOURNAMENT_LINE = 'Coaches see tournament rounds live.';
const REMEMBER_LABEL = 'Use this for future practice rounds';

/**
 * "Show this round live to" (4.6), inside Round details, after the qualifier choice. The choice does not travel in the
 * setup payload (`ChSetupForm` is unchanged): the field tells the database once when it first shows a value and again on
 * every change, and the database holds it for the one round that is about to be created (`setNext`). Practice can be
 * Not live, Coaches or Coaches and team (the default is the player's own); a qualifier is always shown to coaches, so
 * the other two are unavailable and a caption says why; a tournament has no control. Not drawn at all until the live
 * table exists (`loadPrefs` answers null), so nothing is offered that cannot work.
 */
export function LiveShareField({ type, ports }: { type: LiveRoundType; ports: LiveSharePorts }) {
  const control = shareControl(type);
  const [prefs, setPrefs] = useState<{ practiceShare: LiveShare } | null | 'loading'>('loading');
  const [level, setLevel] = useState<LiveShare | null>(null);
  const [remember, setRemember] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const good = useRef<LiveShare | null>(null);
  const sent = useRef('');

  useEffect(() => {
    let alive = true;
    void ports.loadPrefs().then((p) => {
      if (!alive) return;
      setPrefs(p);
      if (p) {
        good.current = p.practiceShare;
        setLevel(p.practiceShare);
      }
    });
    return () => {
      alive = false;
    };
  }, [ports]);

  // Tell the database what the field shows, once per value (and again when "remember" changes).
  useEffect(() => {
    if (control !== 'choose' || prefs === 'loading' || !prefs || level === null) return;
    const key = `${level}:${remember}`;
    if (sent.current === key) return;
    sent.current = key;
    let alive = true;
    void ports.setNext(level, remember).then((r) => {
      if (!alive) return;
      if (r.success) {
        good.current = level;
        setError(null);
        return;
      }
      // The control returns to the level it had, and says so.
      setError(r.error);
      if (good.current) {
        sent.current = `${good.current}:${remember}`;
        setLevel(good.current);
      }
    });
    return () => {
      alive = false;
    };
  }, [control, prefs, level, remember, ports]);

  if (prefs === 'loading' || !prefs) return null;
  if (control === 'none') {
    return (
      <div className="ch-rsu-field ch-lv-share">
        <span>{SHARE_COPY.label}</span>
        <span className="ch-rsu-field__hint">{TOURNAMENT_LINE}</span>
      </div>
    );
  }

  const shown = control === 'floor' ? floorShare(type, 'coaches') : (level ?? prefs.practiceShare);
  return (
    <div className="ch-rsu-field ch-lv-share" data-ch-code="CH-16660">
      <span>{SHARE_COPY.label}</span>
      <div data-ch-code="CH-16661">
        <Segmented<LiveShare>
          block
          label={SHARE_COPY.label}
          value={shown}
          options={shareOptions(type)}
          onChange={(next) => {
            setError(null);
            setTouched(true);
            setRemember(true);
            setLevel(next);
          }}
        />
      </div>
      {control === 'floor' && (
        <span className="ch-rsu-field__hint" data-ch-code="CH-16662">
          {SHARE_COPY.qualifierCaption}
        </span>
      )}
      <span className="ch-rsu-field__hint" data-ch-code="CH-16663">
        {SHARE_COPY.helper}
      </span>
      {control === 'choose' && (
        <span className="ch-rsu-field__hint" data-ch-code="CH-16684">
          {SHARE_COPY.notLiveNote}
        </span>
      )}
      {control === 'choose' && touched && (
        <div className="ch-lv-share__remember">
          <Switch checked={remember} onChange={setRemember} label={REMEMBER_LABEL} />
        </div>
      )}
      {error && (
        <span className="ch-rsu-field__hint ch-lv-share__error" role="alert" data-ch-code="CH-16664">
          {error}
        </span>
      )}
    </div>
  );
}
