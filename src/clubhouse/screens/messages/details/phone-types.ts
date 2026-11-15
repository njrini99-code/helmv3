/** What New message hands the thread that opens next: the text and any files picked with it. */
export type FirstMessage = { text: string; files: File[] };

/** A new announcement not yet posted. */
export type AnnDraft = { title: string; body: string; urgent: boolean; ack: boolean };

export const NO_ANN: AnnDraft = { title: "", body: "", urgent: false, ack: true };
