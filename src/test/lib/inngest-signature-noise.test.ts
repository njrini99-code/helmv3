import { describe, expect, it, vi, afterEach } from 'vitest';
import { internalLogger } from '@/lib/inngest/client';

/**
 * The Inngest SDK's internal logger is filtered so that ONE rejected signature
 * stops rendering as three separate production incidents. A filter like that
 * earns its keep only if it is narrow: the danger is not that it misses a
 * signature message, it is that it quietly eats a real crash. The last test
 * here is the one that matters.
 */
describe('inngest internal logger', () => {
  afterEach(() => vi.restoreAllMocks());

  it('demotes the pino-style signature rejection the SDK actually emits', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    internalLogger.error({ err: new Error('Invalid signature'), method: 'GET' }, 'Signature validation failed');

    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it.each([
    'No x-inngest-signature provided',
    'Signature has expired',
    'Invalid x-inngest-signature provided',
  ])('demotes %s', (message) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    internalLogger.error(new Error(message));

    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('leaves every other SDK error on console.error, untouched', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const realFailures = [
      new Error('Failed to register functions with Inngest'),
      new Error('Missing request body when syncing'),
      new Error('Inngest API Error: 404 Event key not found'),
      new Error('Could not find function with ID: coachhelm-round-analysis'),
    ];
    for (const failure of realFailures) internalLogger.error({ err: failure }, failure.message);

    expect(error).toHaveBeenCalledTimes(realFailures.length);
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not touch warn, info or debug', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});

    internalLogger.warn('Signature validation failed');
    internalLogger.info('syncing');
    internalLogger.debug('step');

    expect(warn).toHaveBeenCalledWith('Signature validation failed');
    expect(info).toHaveBeenCalledWith('syncing');
    expect(debug).toHaveBeenCalledWith('step');
  });
});
