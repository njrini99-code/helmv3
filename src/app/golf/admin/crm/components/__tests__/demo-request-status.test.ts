import { describe, expect, it } from 'vitest';
import {
  isNewRequest,
  isContactedRequest,
  isScheduledRequest,
  isConvertedRequest,
  isDeclinedRequest,
  canAdvanceRequest,
  buildDeclineUpdate,
} from '../demo-request-status';

describe('demo request status predicates', () => {
  it('treats a null status as new/pending', () => {
    expect(isNewRequest({ status: null })).toBe(true);
  });

  it('treats an explicit "pending" status as new', () => {
    expect(isNewRequest({ status: 'pending' })).toBe(true);
  });

  it.each(['contacted', 'scheduled', 'completed', 'declined'])(
    'does not treat "%s" as new',
    (status) => {
      expect(isNewRequest({ status })).toBe(false);
    },
  );

  it('identifies contacted rows', () => {
    expect(isContactedRequest({ status: 'contacted' })).toBe(true);
    expect(isContactedRequest({ status: 'pending' })).toBe(false);
  });

  it('identifies scheduled rows', () => {
    expect(isScheduledRequest({ status: 'scheduled' })).toBe(true);
    expect(isScheduledRequest({ status: 'contacted' })).toBe(false);
  });

  it('identifies converted (completed) rows', () => {
    expect(isConvertedRequest({ status: 'completed' })).toBe(true);
    expect(isConvertedRequest({ status: 'converted' })).toBe(false);
  });

  it('identifies declined rows', () => {
    expect(isDeclinedRequest({ status: 'declined' })).toBe(true);
    expect(isDeclinedRequest({ status: 'pending' })).toBe(false);
  });

  it('allows advancing pending/contacted/scheduled rows', () => {
    expect(canAdvanceRequest({ status: 'pending' })).toBe(true);
    expect(canAdvanceRequest({ status: 'contacted' })).toBe(true);
    expect(canAdvanceRequest({ status: 'scheduled' })).toBe(true);
  });

  it('blocks advancing terminal (completed/declined) rows', () => {
    expect(canAdvanceRequest({ status: 'completed' })).toBe(false);
    expect(canAdvanceRequest({ status: 'declined' })).toBe(false);
  });
});

describe('buildDeclineUpdate', () => {
  it('trims and keeps a non-blank reason as notes', () => {
    expect(buildDeclineUpdate('  Not a fit right now  ')).toEqual({
      status: 'declined',
      notes: 'Not a fit right now',
    });
  });

  it('stores null (not empty string) for a blank reason', () => {
    expect(buildDeclineUpdate('   ')).toEqual({ status: 'declined', notes: null });
  });

  it('stores null for an empty reason', () => {
    expect(buildDeclineUpdate('')).toEqual({ status: 'declined', notes: null });
  });
});
