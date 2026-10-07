import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Button } from '@/components/fairway/controls/button';
import { formSignature, readSaveButton } from './unsaved-probe';

/**
 * The probe reads SaveRow's Button (FairwaySettingsGeneral.tsx SaveRow):
 * `variant={disabled ? 'secondary' : 'primary'}`, `disabled={!isDirty}`,
 * `busy={saving}`. Rendering the real Fairway Button with those props pins
 * the attribute contract the probe depends on.
 */
function SaveRowLike({ dirty, busy = false }: { dirty: boolean; busy?: boolean }) {
  return (
    <Button variant={dirty ? 'primary' : 'secondary'} size="sm" busy={busy} disabled={!dirty}>
      Save changes
    </Button>
  );
}

describe('unsaved probe DOM readers', () => {
  it('reads a pristine, dirty and saving SaveRow', () => {
    const clean = render(<SaveRowLike dirty={false} />);
    expect(readSaveButton(clean.container)).toBe('clean');
    clean.unmount();

    const dirty = render(<SaveRowLike dirty />);
    expect(readSaveButton(dirty.container)).toBe('dirty');
    dirty.unmount();

    const saving = render(<SaveRowLike dirty busy />);
    expect(readSaveButton(saving.container)).toBe('saving');
  });

  it('skips the avatar upload button and treats a Retry-only panel as having no Save', () => {
    const withUpload = render(
      <div>
        <Button variant="secondary" size="sm">
          Upload Photo
        </Button>
        <Button variant="ghost" size="sm">
          Remove
        </Button>
        <SaveRowLike dirty={false} />
      </div>,
    );
    expect(readSaveButton(withUpload.container)).toBe('clean');
    withUpload.unmount();

    const uploading = render(
      <div>
        <Button variant="secondary" size="sm" busy>
          Upload Photo
        </Button>
        <SaveRowLike dirty={false} />
      </div>,
    );
    expect(readSaveButton(uploading.container)).toBe('clean');
    uploading.unmount();

    const retryOnly = render(
      <Button variant="secondary" size="sm">
        Retry
      </Button>,
    );
    expect(readSaveButton(retryOnly.container)).toBe('absent');
  });

  it('signs text, range, switch, pressed-tile and select values', () => {
    const view = render(
      <div>
        <input aria-label="Name" defaultValue="Pat" />
        <input aria-label="First reminder" type="range" min={2} max={168} defaultValue={24} />
        <div role="switch" aria-checked="true" tabIndex={0}>
          Send reminders
        </div>
        <div role="button" aria-pressed="false" tabIndex={0}>
          Match play
        </div>
        <span data-slot="select-value">USGA Handicap</span>
      </div>,
    );
    const before = formSignature(view.container);
    const range = view.container.querySelector<HTMLInputElement>('input[type="range"]')!;
    range.value = '48';
    expect(formSignature(view.container)).not.toBe(before);
    range.value = '24';
    expect(formSignature(view.container)).toBe(before);
    view.container.querySelector('[role="switch"]')!.setAttribute('aria-checked', 'false');
    expect(formSignature(view.container)).not.toBe(before);
  });
});
