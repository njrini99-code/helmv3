/**
 * Display-normalize a course name: strip trailing internal/QA disambiguation
 * parentheticals like " (real)", " (test)", " (QA)", " (demo)", " (copy)".
 * These are seed/data-hygiene artifacts that must never reach a user (they
 * leaked into round rows, page headlines, and generated insight prose — audit
 * W3). The underlying data is cleaned separately; this is the render-layer
 * backstop so a future stray suffix can't reappear in the UI.
 */
const QA_SUFFIX = /\s*\((real|test|qa|demo|copy|dup|internal)\)\s*$/i;

export function cleanCourseName(name: string | null | undefined): string {
  if (!name) return '';
  return name.replace(QA_SUFFIX, '').trim();
}
