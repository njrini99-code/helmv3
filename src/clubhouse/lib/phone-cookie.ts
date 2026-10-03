/**
 * The cookie that tells the server which layout this device last drew ("1" phone, "0" desktop), so a cold load renders
 * the phone structure from the first frame (swap audit F-36). A plain module: the server reads it in phone-hint.ts and
 * the client writes it in use-phone.ts; a constant exported from a 'use client' module is a client reference on the
 * server, not the string.
 */
export const CH_PHONE_COOKIE = 'ch_phone';
