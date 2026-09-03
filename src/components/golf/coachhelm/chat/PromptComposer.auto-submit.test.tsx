/**
 * ============================================================================
 * PromptComposer — auto-submit-once and failure-restore (owner UX audit,
 * GAPS_AUDIT_INTERACTION_CRUD_2026-09-02)
 * ----------------------------------------------------------------------------
 * The bug: a question started on the Brief tab navigated to the full Ask page
 * with `?q=`, which only PRE-FILLED the composer — the coach then had to press
 * Send a second time, unexplained. `autoSubmit` fixes that by driving the same
 * `submit()` a manual Send uses, once, on mount.
 *
 * These tests exercise `PromptComposer` directly (no AI SDK involved — `onSend`
 * is a plain spy standing in for whatever the caller wires up), which is
 * exactly what makes "the same code path a manual Send uses" checkable: both
 * the manual-click test and the auto-submit tests below call through the
 * identical `submit()` closure inside this component.
 * ============================================================================
 */
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PromptComposer } from './PromptComposer';

type Props = React.ComponentProps<typeof PromptComposer>;

function baseProps(overrides: Partial<Props> = {}): Props {
  return {
    onSend: vi.fn(),
    players: [],
    context: [],
    onAddContext: vi.fn(),
    onRemoveContext: vi.fn(),
    ...overrides,
  };
}

const field = () => screen.getByRole('combobox', { name: 'Ask CoachHelm' });
const sendButton = () => screen.getByRole('button', { name: 'Send' });

describe('PromptComposer — manual send (baseline)', () => {
  it('sends the typed text and clears the field immediately', () => {
    const onSend = vi.fn();
    render(<PromptComposer {...baseProps({ onSend })} />);

    fireEvent.change(field(), { target: { value: 'How is putting trending?' } });
    fireEvent.click(sendButton());

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('How is putting trending?');
    expect(field()).toHaveValue('');
  });
});

describe('PromptComposer — autoSubmit', () => {
  it('submits a pending question once on mount, through the same submit() as a manual Send', () => {
    const onSend = vi.fn();
    render(<PromptComposer {...baseProps({ onSend, initialValue: 'Brief me on the team', autoSubmit: true })} />);

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('Brief me on the team');
  });

  it('clears the composer as part of that same auto-submit — no stale text after it fires', () => {
    render(<PromptComposer {...baseProps({ initialValue: 'Brief me on the team', autoSubmit: true })} />);

    expect(field()).toHaveValue('');
  });

  it('does not double-submit under React StrictMode\'s double-invoked mount effect', () => {
    const onSend = vi.fn();
    render(
      <React.StrictMode>
        <PromptComposer {...baseProps({ onSend, initialValue: 'Brief me on the team', autoSubmit: true })} />
      </React.StrictMode>,
    );

    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there is no initial value to submit', () => {
    const onSend = vi.fn();
    render(<PromptComposer {...baseProps({ onSend, autoSubmit: true })} />);

    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not submit blank/whitespace-only input', () => {
    const onSend = vi.fn();
    render(<PromptComposer {...baseProps({ onSend, initialValue: '   ', autoSubmit: true })} />);

    expect(onSend).not.toHaveBeenCalled();
  });

  it('waits on the same busy guard a manual Send respects, rather than bypassing it', () => {
    const onSend = vi.fn();
    render(<PromptComposer {...baseProps({ onSend, initialValue: 'Brief me on the team', autoSubmit: true, busy: true })} />);

    expect(onSend).not.toHaveBeenCalled();
    // submit() bailed out before clearing, so the question is still there —
    // it is neither silently dropped nor sent out of turn.
    expect(field()).toHaveValue('Brief me on the team');
  });

  it('does not autofocus the field — an auto-submitting composer must not summon a mobile keyboard for text no one is about to type', () => {
    render(<PromptComposer {...baseProps({ initialValue: 'Brief me on the team', autoSubmit: true })} />);

    expect(field()).not.toHaveFocus();
  });
});

describe('PromptComposer — quick-action seeding is unaffected', () => {
  it('still only seeds (and focuses) the field without autoSubmit — never sends blind', () => {
    const onSend = vi.fn();
    render(<PromptComposer {...baseProps({ onSend, initialValue: 'Compare ' })} />);

    expect(onSend).not.toHaveBeenCalled();
    expect(field()).toHaveValue('Compare ');
  });
});

describe('PromptComposer — failed sends keep the text; successful ones do not', () => {
  it('restores the just-submitted text once `failed` turns true', () => {
    const onSend = vi.fn();
    const { rerender } = render(<PromptComposer {...baseProps({ onSend })} />);

    fireEvent.change(field(), { target: { value: 'How is putting trending?' } });
    fireEvent.click(sendButton());
    expect(field()).toHaveValue('');

    rerender(<PromptComposer {...baseProps({ onSend, failed: true })} />);

    expect(field()).toHaveValue('How is putting trending?');
  });

  it('never repopulates the field for a turn that succeeded', () => {
    const onSend = vi.fn();
    const { rerender } = render(<PromptComposer {...baseProps({ onSend, failed: false })} />);

    fireEvent.change(field(), { target: { value: 'How is putting trending?' } });
    fireEvent.click(sendButton());
    expect(field()).toHaveValue('');

    // Re-render with the same (still-false) `failed` — the common case of a
    // parent re-render after a successful turn — must not restore anything.
    rerender(<PromptComposer {...baseProps({ onSend, failed: false })} />);

    expect(field()).toHaveValue('');
  });

  it('restores the auto-submitted question on failure too, not just a manual one', () => {
    const onSend = vi.fn();
    const { rerender } = render(
      <PromptComposer {...baseProps({ onSend, initialValue: 'Brief me on the team', autoSubmit: true })} />,
    );
    expect(field()).toHaveValue('');

    rerender(
      <PromptComposer
        {...baseProps({ onSend, initialValue: 'Brief me on the team', autoSubmit: true, failed: true })}
      />,
    );

    expect(field()).toHaveValue('Brief me on the team');
  });
});
