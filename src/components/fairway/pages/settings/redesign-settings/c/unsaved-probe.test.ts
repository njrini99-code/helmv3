import { describe, expect, it } from 'vitest';
import {
  advanceProbe,
  FRESH_PROBE,
  recordFirstTouch,
  type FormSnapshot,
  type ProbeMemory,
  type ProbeVerdict,
} from './unsaved-probe';

/** Feed a sequence of events through the probe; returns the last verdict. */
function run(steps: Array<{ touch?: FormSnapshot; observe?: FormSnapshot }>): ProbeVerdict {
  let memory: ProbeMemory = FRESH_PROBE;
  let verdict: ProbeVerdict = { unsaved: false, saving: false };
  for (const step of steps) {
    if (step.touch) memory = recordFirstTouch(memory, step.touch);
    if (step.observe) {
      const next = advanceProbe(memory, step.observe);
      memory = next.memory;
      verdict = next.verdict;
    }
  }
  return verdict;
}

const snap = (save: FormSnapshot['save'], signature: string): FormSnapshot => ({ save, signature });

describe('unsaved probe', () => {
  it('an untouched sheet is never unsaved', () => {
    expect(run([{ observe: snap('clean', 'a') }])).toEqual({ unsaved: false, saving: false });
  });

  it('a primary Save means unsaved edits', () => {
    expect(run([{ observe: snap('clean', 'a') }, { touch: snap('clean', 'a'), observe: snap('dirty', 'b') }]))
      .toEqual({ unsaved: true, saving: false });
  });

  it('editing back to the loaded value is clean again', () => {
    expect(
      run([
        { observe: snap('clean', 'a') },
        { touch: snap('clean', 'a'), observe: snap('dirty', 'b') },
        { observe: snap('clean', 'a') },
      ]).unsaved,
    ).toBe(false);
  });

  it('an async panel filling its fields after mount is not an edit', () => {
    expect(
      run([
        { observe: snap('absent', '') }, // skeleton
        { touch: snap('absent', '') }, // a tap on the skeleton takes no baseline
        { observe: snap('clean', 'loaded') },
        { touch: snap('clean', 'loaded'), observe: snap('clean', 'loaded') },
      ]).unsaved,
    ).toBe(false);
  });

  it('an edit that disables Save (invalid reminder ordering) is still unsaved', () => {
    expect(
      run([
        { observe: snap('clean', '24|60') },
        { touch: snap('clean', '24|60'), observe: snap('dirty', '4|60') },
        { observe: snap('clean', '2|180') }, // Save disabled, values moved
      ]).unsaved,
    ).toBe(true);
  });

  it('a finished save re-baselines, so closing afterwards does not prompt', () => {
    expect(
      run([
        { observe: snap('clean', 'a') },
        { touch: snap('clean', 'a'), observe: snap('dirty', 'b') },
        { observe: snap('saving', 'b') },
        { observe: snap('clean', 'b') },
      ]),
    ).toEqual({ unsaved: false, saving: false });
  });

  it('reports a save in flight', () => {
    expect(
      run([
        { observe: snap('clean', 'a') },
        { touch: snap('clean', 'a'), observe: snap('dirty', 'b') },
        { observe: snap('saving', 'b') },
      ]),
    ).toEqual({ unsaved: false, saving: true });
  });

  it('a failed save stays unsaved', () => {
    expect(
      run([
        { observe: snap('clean', 'a') },
        { touch: snap('clean', 'a'), observe: snap('dirty', 'b') },
        { observe: snap('saving', 'b') },
        { observe: snap('dirty', 'b') },
      ]).unsaved,
    ).toBe(true);
  });

  it('a snapshot that catches up after the save (profile reload) re-baselines', () => {
    expect(
      run([
        { observe: snap('clean', 'a') },
        { touch: snap('clean', 'a'), observe: snap('dirty', 'b') },
        { observe: snap('saving', 'b') },
        { observe: snap('dirty', 'b') }, // saved, but the panel's baseline is stale
        { observe: snap('clean', 'b') }, // reload lands; nothing the user did
      ]).unsaved,
    ).toBe(false);
  });

  it('a form cleared by its own save (email, password) is clean', () => {
    expect(
      run([
        { observe: snap('clean', '') },
        { touch: snap('clean', ''), observe: snap('dirty', 'new@x.com') },
        { observe: snap('saving', 'new@x.com') },
        { observe: snap('clean', '') },
      ]).unsaved,
    ).toBe(false);
  });
});
