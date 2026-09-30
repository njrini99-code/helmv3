'use client';

import { createContext, useContext } from 'react';
import { checkCode, createAccount, finishPlayer, sendRequest, uploadPhoto } from './writes';

/**
 * The server calls, behind a context so the dev preview can draw every step and
 * every failure over sample answers without creating an account (there is one
 * database, and it is production). The app always gets the real calls.
 */
export interface OnboardWrites {
  checkCode: typeof checkCode;
  createAccount: typeof createAccount;
  finishPlayer: typeof finishPlayer;
  uploadPhoto: typeof uploadPhoto;
  sendRequest: typeof sendRequest;
}

export const REAL_WRITES: OnboardWrites = { checkCode, createAccount, finishPlayer, uploadPhoto, sendRequest };

export const OnboardWritesContext = createContext<OnboardWrites>(REAL_WRITES);

export const useOnboardWrites = (): OnboardWrites => useContext(OnboardWritesContext);
