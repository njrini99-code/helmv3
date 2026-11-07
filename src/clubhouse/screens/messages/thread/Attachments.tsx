'use client';

import type { ChAttachment } from '../model';
import { useState, useRef, useEffect } from 'react';
import { Icon } from '../../../ui/Icon';
import { FileText, Download, RotateCw } from 'lucide-react';
import { fileKind, fileSize } from '../files';
import { Modal } from '../../../ui/Modal';
import type { ChMessagesApi } from '../api/types';
import { chReport } from '../../../lib/track';
import { Skeleton } from '../../../ui/States';

/** A photo in a message: shown in the thread, a click opens the full file. One that won't load falls back to the file chip. */
function ImageAttachment({ f }: { f: ChAttachment; }) {
  const [broken, setBroken] = useState(false);
  const [viewing, setViewing] = useState(false);
  if (broken) {
    return (
      <a className="ch-ms-bub ch-ms-bub--file" href={f.url ?? undefined} target="_blank" rel="noreferrer">
        <span className="ch-ms-file__ic">
          <Icon icon={FileText} size={16} />
        </span>
        <span style={{ minWidth: 0 }}>
          <b>{f.name}</b>
          <span>{`${fileKind(f.mime)} · ${fileSize(f.size)}`}</span>
        </span>
        <Icon icon={Download} size={15} />
      </a>
    );
  }
  return (
    <>
      {/* A photo opens here, in the app; the original is one more tap inside it. */}
      <button type="button" className="ch-ms-img" aria-label={`Open ${f.name}`} onClick={() => setViewing(true)}>
        {/* A plain img on purpose: a signed storage URL, sized by the thread, not an optimised asset. */}
        <img src={f.url ?? undefined} alt={f.name} loading="lazy" decoding="async" onError={() => setBroken(true)} />
      </button>
      <Modal open={viewing} title={f.name} onClose={() => setViewing(false)}>
        <div className="ch-ms-imgview">
          <img src={f.url ?? undefined} alt={f.name} decoding="async" />
          <a className="ch-ms-imgview__orig" href={f.url ?? undefined} target="_blank" rel="noreferrer">
            Open original
          </a>
        </div>
      </Modal>
    </>
  );
}

export function Attachments({
  load,
  id,
  mine,
}: {
  load: ChMessagesApi["attachments"];
  id: string;
  mine: boolean;
}) {
  const [files, setFiles] = useState<ChAttachment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Signed URLs expire (1 h). A thread left open longer re-signs them: on a timer, and on coming back to the tab.
  const [refresh, setRefresh] = useState(0);
  const loadedAt = useRef(0);
  const haveFiles = useRef(false);
  // A long thread doesn't sign every file on open: only what's about to scroll into view (MOB-MSG-24).
  const spot = useRef<HTMLSpanElement | null>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = spot.current;
    if (near || !el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setNear(true);
    }, { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  useEffect(() => {
    if (!near) return;
    let live = true;
    let retry: number | undefined;
    const silent = haveFiles.current;
    if (!silent) setFailed(false);
    // The message row can reach a recipient before its attachment rows exist (separate inserts), so an
    // empty list for a message flagged as having files is asked again once before it is believed.
    const run = (again: boolean) =>
      load(id)
        .then((a) => {
          if (!live) return;
          if (a && a.length === 0 && again) {
            retry = window.setTimeout(() => run(false), 1500);
            return;
          }
          if (a) {
            loadedAt.current = Date.now();
            haveFiles.current = true;
            setFiles(a);
          } else if (!silent) setFailed(true);
        })
        .catch((err) => {
          chReport(err, { surface: "messages.attachments", severity: "low" });
          if (live && !silent) setFailed(true);
        });
    void run(true);
    return () => {
      live = false;
      if (retry) window.clearTimeout(retry);
    };
  }, [load, id, attempt, refresh, near]);
  useEffect(() => {
    const AGE = 45 * 60_000;
    const stale = () => haveFiles.current && Date.now() - loadedAt.current > AGE;
    const timer = window.setInterval(() => {
      if (stale()) setRefresh((n) => n + 1);
    }, 5 * 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible" && stale()) setRefresh((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  if (failed) {
    return (
      <button
        type="button"
        className="ch-ms-bub ch-ms-bub--file"
        data-ch-code="CH-7209"
        onClick={() => setAttempt((a) => a + 1)}
      >
        <span className="ch-ms-file__ic">
          <Icon icon={RotateCw} size={15} />
        </span>
        <span>
          <b>Attachment didn’t load</b>
          <span>Tap to try again</span>
        </span>
      </button>
    );
  }
  if (!files)
    return (
      <span ref={spot} aria-busy="true" data-ch-code="CH-7408">
        <Skeleton width={240} height={54} radius={14} />
      </span>
    );
  return (
    <>
      {files.map((f) =>
        f.mime.startsWith("image/") && f.url ? (
          <ImageAttachment key={f.id} f={f} />
        ) : (
        <a
          key={f.id}
          className="ch-ms-bub ch-ms-bub--file"
          href={f.url ?? undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!f.url}
        >
          <span className="ch-ms-file__ic">
            <Icon icon={FileText} size={16} />
          </span>
          <span style={{ minWidth: 0 }}>
            <b>{f.name}</b>
            <span>{`${fileKind(f.mime)} · ${fileSize(f.size)}`}</span>
          </span>
          <Icon icon={Download} size={15} />
          {mine && <span className="ch-sr-only">Sent by you</span>}
        </a>
        ),
      )}
    </>
  );
}
