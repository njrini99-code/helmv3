/**
 * CoachHelm chat: what a coach may change on a card before confirming, and the re-plan that follows.
 *
 * A task names the fields of its own input a coach may edit in the preview. Everything else about a field (its type,
 * its allowed values, its limits) is read from the task's own zod schema, the one `plan` validates with, so the form
 * the card draws and the check the server makes cannot part ways. `reviseInput` merges the coach's edits into the
 * stored input and validates the result with that same schema; the task then plans again from it, with every check
 * and every read `plan` makes. No model is called.
 *
 * Never editable: who the coach is, the team, and the thing a card is about (the tournament, the round, the thread,
 * the plan, the player a goal or note belongs to). Changing those is a different request, and the coach asks for it.
 */
import { z } from 'zod';
import type { EditableField } from './card-types';

/** The message a coach reads when an edit is not allowed or not valid. */
export class EditRefused extends Error {}

type JsonSchema = { type?: string | string[]; enum?: unknown[]; pattern?: string; format?: string; maxLength?: number; minLength?: number; minimum?: number; maximum?: number; multipleOf?: number; items?: JsonSchema; maxItems?: number; minItems?: number; anyOf?: JsonSchema[]; properties?: Record<string, JsonSchema>; required?: string[] };

const words = (key: string): string => {
  const text = key.replace(/_ids?$/, '').replace(/_/g, ' ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
};
const optionLabel = (value: string): string => words(value);
/** A nullable or optional property is `anyOf [T, null]` in the strict form; the plain form is `T`. */
const core = (s: JsonSchema): JsonSchema => s.anyOf?.find((x) => x.type !== 'null') ?? s;

/**
 * A day or a time of day, told from what the field's own pattern accepts and refuses, so a stricter pattern (a 24-hour
 * time as `^([01]\d|2[0-3]):[0-5]\d$`) is recognised as well as the loose one. Null when it is neither.
 */
function shapeOf(pattern: string): 'date' | 'time' | null {
  if (!pattern) return null;
  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch {
    return null;
  }
  if (re.test('2026-11-10') && !re.test('09:30') && !re.test('lunch')) return 'date';
  if (re.test('09:30') && re.test('23:59') && !re.test('2026-11-10') && !re.test('lunch')) return 'time';
  return null;
}

/**
 * The editable fields of a card: one per key the task allows, typed and limited by the task's own schema.
 * `labels` maps a key to the fact label it shows as on the card; `people` is the roster a player list is chosen from.
 */
export function editableFields(schema: z.ZodType, keys: readonly string[], input: unknown, opts: { labels?: Record<string, string>; people?: ReadonlyArray<{ id: string; name: string }> } = {}): EditableField[] {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as JsonSchema;
  const values = (input ?? {}) as Record<string, unknown>;
  const required = new Set(json.required ?? []);
  const out: EditableField[] = [];
  for (const key of keys) {
    const raw = json.properties?.[key];
    if (!raw) continue;
    const prop = core(raw);
    const base = { key, label: opts.labels?.[key] ?? words(key), required: required.has(key) && raw === prop };
    const value = values[key] ?? null;
    const type = Array.isArray(prop.type) ? prop.type.find((t) => t !== 'null') : prop.type;
    if (prop.enum) out.push({ ...base, type: 'choice', value: typeof value === 'string' ? value : null, options: prop.enum.map((v) => ({ value: String(v), label: optionLabel(String(v)) })) });
    else if (type === 'boolean') out.push({ ...base, type: 'toggle', value: value === true });
    else if (type === 'number' || type === 'integer') out.push({ ...base, type: 'number', value: typeof value === 'number' ? value : null, ...(prop.minimum !== undefined ? { min: prop.minimum } : {}), ...(prop.maximum !== undefined ? { max: prop.maximum } : {}), ...(type === 'integer' ? { step: prop.multipleOf ?? 1 } : prop.multipleOf ? { step: prop.multipleOf } : {}) });
    else if (type === 'array') {
      const item = core(prop.items ?? {});
      const list = Array.isArray(value) ? value.map(String) : [];
      if (item.format === 'uuid') out.push({ ...base, type: 'people', value: list, options: (opts.people ?? []).map((p) => ({ value: p.id, label: p.name })), ...(prop.maxItems !== undefined ? { max_items: prop.maxItems } : {}), ...(prop.minItems ? { min_items: prop.minItems } : {}) });
      else if (item.type === 'integer' || item.type === 'number') continue; // a list of numbers (weekdays) is not a field a card can edit
      else out.push({ ...base, type: 'list', value: list, ...(prop.maxItems !== undefined ? { max_items: prop.maxItems } : {}), ...(item.maxLength !== undefined ? { max_length: item.maxLength } : {}) });
    } else if (type === 'string') {
      const pattern = prop.pattern ?? '';
      const kind = prop.format === 'date-time' ? 'datetime' : (shapeOf(pattern) ?? (/\\d\{4\}-\\d\{2\}-\\d\{2\}/.test(pattern) ? 'date' : /\\d\{(?:1,)?2\}:\\d\{2\}/.test(pattern) ? 'time' : (prop.maxLength ?? 0) > 300 ? 'long_text' : 'text'));
      out.push({ ...base, type: kind, value: typeof value === 'string' ? value : null, ...(prop.maxLength !== undefined ? { max_length: prop.maxLength } : {}), ...(prop.minLength ? { min_length: prop.minLength } : {}) });
    }
  }
  return out;
}

/**
 * The stored input with the coach's edits, validated by the task's own schema. Only keys the card offered may be
 * edited; `null` clears an optional field. Anything the server read for the old card (`seen`) is dropped: the plan
 * that follows reads the world again.
 */
export function reviseInput<I>(schema: z.ZodType<I>, stored: unknown, edits: Record<string, unknown>, editable: readonly string[]): I {
  const unknown = Object.keys(edits).filter((k) => !editable.includes(k));
  if (unknown.length) throw new EditRefused(`${words(unknown[0]!)} cannot be changed on this card. Ask for it in words instead.`);
  // What the model first gave, as the schema keeps it (the schema drops what the server added).
  const before = schema.safeParse(stored);
  if (!before.success) throw new EditRefused('This card can no longer be edited. Ask for it again.');
  const merged: Record<string, unknown> = { ...(before.data as Record<string, unknown>) };
  for (const [key, value] of Object.entries(edits)) {
    if (value === null || value === '') delete merged[key];
    else merged[key] = value;
  }
  const after = schema.safeParse(merged);
  if (!after.success) {
    const issue = after.error.issues[0];
    const field = issue?.path[0] !== undefined ? words(String(issue.path[0])) : 'That';
    throw new EditRefused(`${field}: ${issue?.message ?? 'that value is not allowed'}.`.replace(/\.\.$/, '.'));
  }
  return after.data;
}
