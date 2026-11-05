/**
 * Sentence splitting without a lookbehind: iOS before 16.4 can't parse one, and a single literal stops the whole script
 * it ships in from loading. Each stop stays on its sentence.
 */
const CUT = '\u0000';

/** Split after . ! or ?, and any closing mark right after it, wherever whitespace follows. */
export function splitSentences(text: string, closers = ''): string[] {
  const stop = new RegExp(`([.!?]${closers ? `[${closers}]?` : ''})\\s+`, 'g');
  return text.replace(stop, `$1${CUT}`).split(CUT);
}

/** The same, only where the next sentence starts with a character in `starts` (a regex class body). */
export function splitSentencesBefore(text: string, starts: string): string[] {
  return text.replace(new RegExp(`([.!?])\\s+(?=[${starts}])`, 'g'), `$1${CUT}`).split(CUT);
}
