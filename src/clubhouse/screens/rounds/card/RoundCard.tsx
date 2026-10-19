'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Printer, Share } from 'lucide-react';
import { useGolfUserOptional } from '@/contexts/golf-user-context';
import type { ChRoundReview } from '../../../data/round-review-shape';
import { formatSigned, formatToPar, NO_DATA } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { chTrail } from '../../../lib/track';
import { Button } from '../../../ui/Button';
import { Modal } from '../../../ui/Modal';
import { Switch } from '../../../ui/Switch';
import { useToast } from '../../../ui/Toast';
import { TeeSwatch } from '../parts';
import { buildCard, countText, figure, holesLine, MARK_NAME, storyLine, type CardBand, type CardHole, type CardModel } from './card-model';
import { canvasBlob, renderCardCanvas } from './draw-card';
import { canShareFile, cardFileName, deliverCard, downloadFile } from './share-card';

/**
 * P011: the round card (docs/clubhouse/phone/round-card.md). A real scorecard for the round the page is showing: Out, In
 * and Total, par, the player's scores in scorecard notation, putts, fairways and greens where tracked, and the strokes
 * gained by leg. It is the thing kept: Share draws it as a 1200px picture on this device, Print puts it alone on a page.
 * Everything on it is the review's own figure (card-model.ts), never a second calculation.
 */

type RowKey = 'par' | 'score' | 'putts' | 'fir' | 'gir';

const ROW_LABEL: Record<RowKey, string> = { par: 'Par', score: 'Score', putts: 'Putts', fir: 'FIR', gir: 'GIR' };

/** A hole's mark, in scorecard notation. Outlines, so they survive a black and white printer; red is for under par only. */
function CardMarkFigure({ hole }: { hole: CardHole }) {
  if (hole.score == null) return <span className="ch-rcard-mk is-none">{NO_DATA}</span>;
  return (
    <span className={'ch-rcard-mk' + (hole.mark ? ` is-${hole.mark}` : '')} role="img" aria-label={`${hole.score}${hole.mark ? `, ${MARK_NAME[hole.mark].toLowerCase()}` : ''}`}>
      <b aria-hidden="true">{hole.score}</b>
    </span>
  );
}

function YesNo({ v }: { v: boolean | null }) {
  if (v == null)
    return (
      <i className="ch-rcard-yn is-na" role="img" aria-label="Not applicable">
        {NO_DATA}
      </i>
    );
  return <i className={'ch-rcard-yn' + (v ? ' is-y' : ' is-n')} role="img" aria-label={v ? 'Hit' : 'Missed'} />;
}

function holeCell(key: RowKey, h: CardHole) {
  switch (key) {
    case 'par':
      return figure(h.par);
    case 'score':
      return <CardMarkFigure hole={h} />;
    case 'putts':
      return h.putts != null && h.putts >= 3 ? <b className="ch-rcard-warn">{h.putts}</b> : figure(h.putts);
    case 'fir':
      return <YesNo v={h.fir} />;
    case 'gir':
      return <YesNo v={h.gir} />;
  }
}

function bandCell(key: RowKey, b: CardBand) {
  switch (key) {
    case 'par':
      return figure(b.par);
    case 'score':
      return <b>{figure(b.score)}</b>;
    case 'putts':
      return figure(b.putts);
    case 'fir':
      return countText(b.fir);
    case 'gir':
      return countText(b.gir);
  }
}

function totalCell(key: RowKey, m: CardModel) {
  switch (key) {
    case 'par':
      return figure(m.total.par);
    case 'score':
      return <b>{figure(m.total.score)}</b>;
    case 'putts':
      return figure(m.total.putts);
    case 'fir':
      return countText(m.total.fir);
    case 'gir':
      return countText(m.total.gir);
  }
}

function SgStrip({ m }: { m: CardModel }) {
  if (!m.sg) return null;
  const tone = (v: number | null) => (v == null || Math.abs(v) < 0.05 ? '' : v > 0 ? ' is-gain' : ' is-loss');
  const cells: Array<[string, number | null]> = [['Strokes gained', m.sg.total], ...m.sg.legs.map((l) => [l.label, l.value] as [string, number | null])];
  return (
    <dl className="ch-rcard-sg">
      {cells.map(([label, v], i) => (
        <div key={label} className={i === 0 ? 'is-total' : undefined}>
          <dt>{label}</dt>
          <dd className={'ch-num' + tone(v)}>{formatSigned(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The card's tables. On a phone each nine is a band of its own (Out above In); on a desktop one wide table runs
 * across: Out, In and Total. Either way a real table with a caption, so a screen reader reads it hole by hole.
 */
function CardTables({ m, wide, tally }: { m: CardModel; wide: boolean; tally: boolean }) {
  const keys: RowKey[] = ['par', 'score', ...(tally ? (['putts', 'fir', 'gir'] as const).filter((k) => m.rows[k]) : [])];
  if (wide) {
    return (
      <table className="ch-rcard-t ch-num is-wide">
        <caption className="ch-sr-only">Scorecard: par, score{tally ? ', putts, fairways and greens' : ''} by hole</caption>
        <thead>
          <tr>
            <th scope="col">Hole</th>
            {m.bands.map((b) => (
              <Fragment key={b.label}>
                {b.holes.map((h) => (
                  <th key={h.n} scope="col">
                    {h.n}
                  </th>
                ))}
                <th scope="col" className="is-sub">
                  {b.label}
                </th>
              </Fragment>
            ))}
            <th scope="col" className="is-tot">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k} className={`is-${k}`}>
              <th scope="row">{ROW_LABEL[k]}</th>
              {m.bands.map((b) => (
                <Fragment key={b.label}>
                  {b.holes.map((h) => (
                    <td key={h.n}>{holeCell(k, h)}</td>
                  ))}
                  <td className="is-sub">{bandCell(k, b)}</td>
                </Fragment>
              ))}
              <td className="is-tot">{totalCell(k, m)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <>
      {m.bands.map((b) => (
        <table key={b.label} className="ch-rcard-t ch-num">
          <caption className="ch-sr-only">{b.label === 'Out' ? 'Front nine' : 'Back nine'}: par, score{tally ? ', putts, fairways and greens' : ''} by hole</caption>
          <thead>
            <tr>
              <th scope="col">Hole</th>
              {b.holes.map((h) => (
                <th key={h.n} scope="col">
                  {h.n}
                </th>
              ))}
              <th scope="col" className="is-sub">
                {b.label}
              </th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k} className={`is-${k}`}>
                <th scope="row">{ROW_LABEL[k]}</th>
                {b.holes.map((h) => (
                  <td key={h.n}>{holeCell(k, h)}</td>
                ))}
                <td className="is-sub">{bandCell(k, b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </>
  );
}

/** The sheet Share opens: the picture as it will go, and what to leave off it. */
function ShareSheet({ open, onClose, model, dateIso }: { open: boolean; onClose: () => void; model: CardModel; dateIso: string }) {
  const toast = useToast();
  const [sg, setSg] = useState(true);
  const [tally, setTally] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = useMemo(() => cardFileName(model, dateIso), [model, dateIso]);
  const showSg = sg && model.sg != null;
  const showTally = tally && (model.rows.putts || model.rows.fir || model.rows.gir);

  // The picture is made before the player taps Share, so the tap itself only hands a finished file to the share sheet (a
  // browser lets a share follow a tap, not a wait for fonts and drawing).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    let url: string | null = null;
    setFailed(false);
    (async () => {
      const canvas = await renderCardCanvas(model, { sg: showSg, tally: Boolean(showTally) });
      const blob = canvas ? await canvasBlob(canvas) : null;
      if (!alive) return;
      if (!blob) {
        setFile(null);
        setSrc(null);
        setFailed(true);
        return;
      }
      const f = new File([blob], name, { type: 'image/png' });
      url = URL.createObjectURL(f);
      setFile(f);
      setSrc(url);
      setCanShare(canShareFile(typeof navigator === 'undefined' ? undefined : navigator, f));
    })().catch(() => {
      if (alive) setFailed(true);
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, model, showSg, showTally, name]);

  const send = async () => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const res = await deliverCard(file, `${model.course} · ${figure(model.total.score)}`, { nav: typeof navigator === 'undefined' ? undefined : navigator, download: (f) => downloadFile(f) });
      if (res === 'cancelled') return;
      haptic('success');
      if (res === 'downloaded') toast({ tone: 'done', title: 'Card saved', body: name, code: 'CH-11922' });
      onClose();
    } catch {
      chTrail('rounds card share failed');
      haptic('error');
      toast({ tone: 'error', title: 'Couldn’t share the card', body: 'Try again, or save the image from the preview.', code: 'CH-11923' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      code="CH-11921"
      open={open}
      onClose={onClose}
      width={460}
      title="Share this card"
      description="Drawn on this device. It goes nowhere until you choose where."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" leftIcon={Share} onClick={() => void send()} disabled={!file} busy={busy}>
            {canShare ? 'Share' : 'Save image'}
          </Button>
        </>
      }
    >
      <div className="ch-rcard-share">
        <div className="ch-rcard-share__pic">
          {src ? (
            <img src={src} alt={`Scorecard: ${model.course}, ${figure(model.total.score)}, ${formatToPar(model.total.toPar)}`} />
          ) : failed ? (
            <p className="ch-rcard-share__fail">The card couldn’t be drawn. Close this and try again.</p>
          ) : (
            <span className="ch-rcard-share__hold" aria-hidden="true" />
          )}
        </div>
        <div className="ch-rcard-share__opts">
          {model.sg && <Switch checked={sg} onChange={setSg} label="Strokes gained" />}
          {(model.rows.putts || model.rows.fir || model.rows.gir) && <Switch checked={tally} onChange={setTally} label="Putts, fairways and greens" />}
        </div>
      </div>
    </Modal>
  );
}

/** `just`: opened straight from Post round (the quiet line under the card). `settle`: the card arrives on the spring; false under reduced motion. */
export function RoundCard({ review: r, phone, just, settle }: { review: ChRoundReview; phone: boolean; just: boolean; settle: boolean }) {
  // A player's own round carries no name; the signed-in player is the one it names. A coach's view carries the player's.
  const user = useGolfUserOptional();
  const name = user?.role === 'player' ? user.name : null;
  const team = user?.teamName ?? null;
  const m = useMemo(() => buildCard(r, { name, team }), [r, name, team]);
  const story = useMemo(() => (just ? storyLine(r) : null), [just, r]);
  const [sharing, setSharing] = useState(false);
  const tone = m.total.toPar == null || m.total.toPar === 0 ? '' : m.total.toPar < 0 ? ' is-under' : ' is-over';
  return (
    <section id="ch-rcard" className="ch-rcard-wrap ch-rprint-keep" aria-label="Scorecard to keep" data-ch-code="CH-11920">
      <article className={'ch-rcard' + (settle ? ' is-just' : '') + (phone ? ' is-phone' : '')} aria-labelledby="ch-rcard-h">
        {/* On the page the hero above already names the round, so the card's head is quiet: its name, its tees and its total. */}
        <div className="ch-rcard-h">
          <div className="ch-rcard-h__l">
            <h2 id="ch-rcard-h">Scorecard</h2>
            <span className="ch-rcard-h__m">
              <TeeSwatch color={r.teeColor} />
              <span>
                {[m.tees, m.total.par != null ? `Par ${m.total.par}` : null, holesLine(m)]
                  .filter((p): p is string => Boolean(p))
                  .map((part, i, all) => (
                    <span key={part} className="ch-rcard-nw">
                      {part}
                      {i < all.length - 1 ? ' · ' : ''}
                    </span>
                  ))}
              </span>
            </span>
          </div>
          <div className="ch-rcard-h__s">
            <b className="ch-num">{figure(m.total.score)}</b>
            <em className={'ch-num' + tone}>{formatToPar(m.total.toPar)}</em>
          </div>
        </div>
        {/* On paper the card stands alone: the full head (the course, the date, the player, the score) is drawn from data-t
            by CSS and shows only when printed. It holds no text, so the page says each thing once. */}
        <div className="ch-rcard-pr" aria-hidden="true">
          <div className="ch-rcard-pr__l">
            <span className="ch-rcard-pr__k" data-t={m.kicker} />
            <span className="ch-rcard-pr__c" data-t={m.course} />
            <span className="ch-rcard-pr__m" data-t={[m.tees, m.total.par != null ? `Par ${m.total.par}` : null, holesLine(m)].filter(Boolean).join(' · ')} />
          </div>
          <div className="ch-rcard-pr__s">
            <span className={'ch-rcard-pr__n'} data-t={figure(m.total.score)} />
            <span className={'ch-rcard-pr__p' + tone} data-t={formatToPar(m.total.toPar)} />
          </div>
        </div>
        <div className="ch-rcard-body">
          <CardTables m={m} wide={!phone} tally />
        </div>
        <SgStrip m={m} />
      </article>
      {story && (
        <p className="ch-rcard-story" data-ch-code="CH-11924">
          {story}
        </p>
      )}
      <div className="ch-rcard-act">
        <Button size={phone ? 'lg' : 'md'} leftIcon={Share} onClick={() => setSharing(true)}>
          Share card
        </Button>
        {!phone && (
          <Button variant="ghost" leftIcon={Printer} onClick={() => window.print()}>
            Print
          </Button>
        )}
      </div>
      <ShareSheet open={sharing} onClose={() => setSharing(false)} model={m} dateIso={r.date} />
    </section>
  );
}
