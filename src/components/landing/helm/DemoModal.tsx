'use client';

import { useEffect, useRef, useState } from 'react';
import { submitDemoRequest } from '@/app/actions/demo-request';
import styles from './helm-landing.module.css';

type Status = 'idle' | 'sending' | 'success';
type Errs = { name?: string; email?: string; school?: string; form?: string };

/**
 * Request-a-demo modal — shared by every "Request Demo" CTA. Ports the design's
 * sc-if modal shell (Escape / overlay-click close, body-scroll lock,
 * first-field focus); submission goes through the real submitDemoRequest
 * server action (demo_requests row + CRM lead + ops alert), never a fake
 * client-side success.
 */
export function HelmDemoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<Status>('idle');
  const [errs, setErrs] = useState<Errs>({});
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStatus('idle');
    setErrs({});
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => firstFieldRef.current?.focus(), 50);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get('name') ?? '').toString().trim();
    const email = (fd.get('email') ?? '').toString().trim();
    const school = (fd.get('school') ?? '').toString().trim();
    const next: Errs = {};
    if (!name) next.name = 'Please enter your name.';
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) next.email = 'Enter a valid work email.';
    if (!school) next.school = 'Which program do you coach?';
    if (Object.keys(next).length) {
      setErrs(next);
      return;
    }
    setErrs({});
    setStatus('sending');
    try {
      const result = await submitDemoRequest(email, { name, school });
      if (result.success) {
        setStatus('success');
      } else {
        setStatus('idle');
        setErrs({ form: result.error ?? 'Something went wrong. Please try again.' });
      }
    } catch {
      setStatus('idle');
      setErrs({ form: 'Something went wrong. Please try again.' });
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    fontFamily: 'var(--sans)',
    fontSize: 15,
    color: 'var(--ink)',
    background: 'var(--sunken)',
    border: '1px solid var(--line)',
    borderRadius: 10,
    padding: '12px 14px',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12.5,
    fontWeight: 560,
    color: 'var(--ink)',
    marginBottom: 6,
  };
  const errStyle: React.CSSProperties = { marginTop: 6, fontSize: 12.5, color: '#DC2626' };

  return (
    <div
      className={`${styles.root} ${styles.modalIn}`}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
        // aria-modal promises a modal — keep Tab cycling inside the dialog so
        // keyboard/AT users can't wander into the inert page behind it.
        if (e.key === 'Tab') {
          const focusables = e.currentTarget.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
          );
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (!first || !last) return;
          const active = document.activeElement;
          if (e.shiftKey && (active === first || !e.currentTarget.contains(active))) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'oklch(0.15 0.01 60/0.42)',
        WebkitBackdropFilter: 'blur(6px)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="demoTitle"
        style={{
          width: 'min(460px,100%)',
          background: 'var(--surface)',
          borderRadius: 28,
          boxShadow: 'var(--raise)',
          padding: 'clamp(24px,4vw,34px)',
          position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 18,
            right: 18,
            width: 34,
            height: 34,
            borderRadius: '50%',
            border: 'none',
            background: 'var(--tint)',
            color: 'var(--ink2)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {status !== 'success' ? (
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--accent700)' }}>
              Request Demo
            </div>
            <h3 id="demoTitle" style={{ margin: '12px 0 0', fontSize: 'clamp(1.4rem,3vw,1.8rem)', lineHeight: 1.1, letterSpacing: '-0.02em', fontWeight: 620, color: 'var(--ink)' }}>
              See GolfHelm with your program.
            </h3>
            <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.5, color: 'var(--ink2)' }}>
              Tell us where you coach and we&apos;ll set up a walkthrough with your data in mind.
            </p>
            <form onSubmit={submit} noValidate style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label htmlFor="dName" style={labelStyle}>Name</label>
                <input ref={firstFieldRef} id="dName" name="name" type="text" autoComplete="name" aria-describedby="errName" style={inputStyle} />
                {errs.name ? <div id="errName" style={errStyle}>{errs.name}</div> : null}
              </div>
              <div>
                <label htmlFor="dEmail" style={labelStyle}>Work email</label>
                <input id="dEmail" name="email" type="email" autoComplete="email" inputMode="email" aria-describedby="errEmail" style={inputStyle} />
                {errs.email ? <div id="errEmail" style={errStyle}>{errs.email}</div> : null}
              </div>
              <div>
                <label htmlFor="dSchool" style={labelStyle}>Program / school</label>
                <input id="dSchool" name="school" type="text" autoComplete="organization" aria-describedby="errSchool" style={inputStyle} />
                {errs.school ? <div id="errSchool" style={errStyle}>{errs.school}</div> : null}
              </div>
              {errs.form ? (
                <div role="alert" style={errStyle}>
                  {errs.form}
                </div>
              ) : null}
              <button
                type="submit"
                disabled={status === 'sending'}
                className={styles.btnPrimary}
                style={{ marginTop: 4, fontFamily: 'var(--sans)', fontSize: 15, fontWeight: 600, padding: '14px 22px', borderRadius: 9999, boxShadow: '0 2px 8px oklch(0.35 0.08 150/0.28)' }}
              >
                {status === 'sending' ? 'Sending…' : 'Request Demo'}
              </button>
              <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: 'var(--ink3)', textAlign: 'center' }}>
                By requesting a demo you agree to our <a href="/privacy">privacy policy</a>. No marketing without consent.
              </p>
            </form>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '14px 0 6px' }}>
            <div style={{ margin: '0 auto', width: 56, height: 56, borderRadius: '50%', background: 'var(--accent50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--accent700)" strokeWidth={2.4}>
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h3 style={{ margin: '18px 0 0', fontSize: '1.5rem', fontWeight: 620, color: 'var(--ink)' }}>Request received.</h3>
            <p style={{ margin: '10px auto 0', fontSize: 14.5, lineHeight: 1.55, color: 'var(--ink2)', maxWidth: '26em' }}>
              Thanks — a member of the Helm team will reach out to schedule your GolfHelm walkthrough.
            </p>
            <button
              type="button"
              onClick={onClose}
              style={{ marginTop: 22, fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 560, color: 'var(--ink)', background: 'var(--tint)', border: 'none', padding: '12px 22px', borderRadius: 9999, cursor: 'pointer' }}
            >
              Back to the page
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
