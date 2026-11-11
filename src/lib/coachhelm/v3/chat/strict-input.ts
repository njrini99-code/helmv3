/**
 * CoachHelm chat: a tool's input in the shape strict tool use takes.
 *
 * With `strict: true` the API guarantees the model's tool input matches the schema, which matters most on a small
 * model. The schema it accepts is narrow: every object closed (`additionalProperties: false`), every property
 * required, and no length, range or item-count keywords. A field that may be left out is therefore sent as required
 * and nullable, and the model writes `null` for "not given".
 *
 * `strictInput(schema)` builds that bare shape from a tool's own zod schema and puts the real schema behind it:
 *
 *     model input  ->  bare shape (types, enums, formats; nulls for absent)
 *                  ->  nulls for optional fields dropped
 *                  ->  the tool's own schema (bounds, patterns, defaults, refinements)
 *
 * So the JSON Schema the model is shown is strict-valid and small, and nothing a tool validated before is lost: an
 * input out of bounds still fails the parse and comes back to the model as an error it can correct. Descriptions are
 * carried over. The result is built once per tool and is the same bytes on every request.
 */
import { z } from 'zod';

type Def = { type: string; [key: string]: unknown };
const defOf = (schema: z.ZodType): Def => (schema as unknown as { _zod: { def: Def } })._zod.def;

/** What a value may be when a tool's own schema says "anything": a scalar or a list of scalars. */
const anyScalar = () => z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]);

interface Bare {
  schema: z.ZodType;
  /** Drops the nulls that stand for "not given", so the tool's own schema sees an absent field and applies its default. */
  clean: (value: unknown) => unknown;
  /** Writes the null a caller left out for a field that may be absent, so an input from a request without `strict` still parses. */
  fill: (value: unknown) => unknown;
}

const identity = (v: unknown) => v;
const dropNullKeys = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(dropNullKeys);
  if (!v || typeof v !== 'object') return v;
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => (x === null ? [] : [[k, dropNullKeys(x)]])));
};

/** Peels the wrappers that only say "may be absent" or "has a default", and reports what it found on the way. */
function peel(schema: z.ZodType): { inner: z.ZodType; optional: boolean; nullable: boolean; description: string | undefined } {
  let inner = schema;
  let optional = false;
  let nullable = false;
  let description = schema.description;
  for (;;) {
    const def = defOf(inner);
    if (def.type === 'optional' || def.type === 'default' || def.type === 'prefault') optional = true;
    else if (def.type === 'nullable') nullable = true;
    else if (def.type !== 'nonoptional' && def.type !== 'readonly' && def.type !== 'catch') break;
    inner = def.innerType as z.ZodType;
    description = description ?? inner.description;
  }
  return { inner, optional, nullable, description };
}

const stringFormat = (def: Def): string | undefined => {
  for (const check of (def.checks as Array<{ _zod: { def: { format?: string } } }> | undefined) ?? []) {
    const format = check._zod.def.format;
    if (format === 'uuid') return 'uuid';
    if (format === 'datetime') return 'date-time';
  }
  return typeof def.format === 'string' && def.format === 'uuid' ? 'uuid' : undefined;
};
const isInteger = (def: Def): boolean => ((def.checks as Array<{ _zod: { def: { format?: string } } }> | undefined) ?? []).some((c) => c._zod.def.format === 'safeint' || c._zod.def.format === 'int32');

function bare(schema: z.ZodType): Bare {
  const def = defOf(schema);
  switch (def.type) {
    case 'object': {
      const shape = def.shape as Record<string, z.ZodType>;
      const fields = Object.entries(shape).map(([key, field]) => {
        const p = peel(field);
        const b = bare(p.inner);
        const described = p.description ? b.schema.describe(p.description) : b.schema;
        return { key, optional: p.optional, absentOk: p.optional || p.nullable, clean: b.clean, fill: b.fill, schema: p.optional || p.nullable ? z.union([described, z.null()]) : described };
      });
      return {
        schema: z.strictObject(Object.fromEntries(fields.map((f) => [f.key, f.schema]))),
        clean: (value) => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
          const out: Record<string, unknown> = {};
          for (const f of fields) {
            const v = (value as Record<string, unknown>)[f.key];
            if (v === undefined || (v === null && f.optional)) continue;
            out[f.key] = v === null ? null : f.clean(v);
          }
          return out;
        },
        fill: (value) => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
          const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
          for (const f of fields) {
            if (out[f.key] === undefined) {
              if (f.absentOk) out[f.key] = null;
            } else if (out[f.key] !== null) out[f.key] = f.fill(out[f.key]);
          }
          return out;
        },
      };
    }
    case 'array': {
      const element = bare(def.element as z.ZodType);
      return { schema: z.array(element.schema), clean: (value) => (Array.isArray(value) ? value.map(element.clean) : value), fill: (value) => (Array.isArray(value) ? value.map(element.fill) : value) };
    }
    case 'tuple': {
      // A fixed-length list is a "complex array constraint" to the API: shown as a plain list, checked as a tuple by the tool's own schema.
      const items = (def.items as z.ZodType[]).map(bare);
      return { schema: z.array(items[0]?.schema ?? z.number()), clean: identity, fill: identity };
    }
    case 'union': {
      const options = (def.options as z.ZodType[]).map(bare);
      return { schema: z.union(options.map((o) => o.schema) as [z.ZodType, z.ZodType, ...z.ZodType[]]), clean: dropNullKeys, fill: identity };
    }
    case 'optional':
    case 'default':
    case 'prefault':
    case 'nullable':
    case 'nonoptional':
    case 'readonly':
    case 'catch': {
      const p = peel(schema);
      const b = bare(p.inner);
      return { schema: p.nullable || p.optional ? z.union([b.schema, z.null()]) : b.schema, clean: (v) => (v === null ? v : b.clean(v)), fill: (v) => (v === null || v === undefined ? v : b.fill(v)) };
    }
    case 'pipe':
      return bare(def.in as z.ZodType);
    case 'string': {
      const format = stringFormat(def);
      return { schema: format ? z.string().meta({ format }) : z.string(), clean: identity, fill: identity };
    }
    case 'number':
    case 'int':
      return { schema: isInteger(def) ? z.number().meta({ type: 'integer' }) : z.number(), clean: identity, fill: identity };
    case 'boolean':
      return { schema: z.boolean(), clean: identity, fill: identity };
    case 'enum':
    case 'literal':
    case 'null':
      return { schema, clean: identity, fill: identity };
    default:
      return { schema: anyScalar(), clean: identity, fill: identity };
  }
}

const built = new WeakMap<z.ZodType, z.ZodType>();

/**
 * The strict-valid form of a tool's input schema. Parsing with it takes what the model sent (nulls for absent fields)
 * and returns what the tool's own schema returns.
 */
export function strictInput<I>(schema: z.ZodType<I>): z.ZodType<I> {
  const cached = built.get(schema);
  if (cached) return cached as z.ZodType<I>;
  const b = bare(schema);
  // The API fills every field when the request sets `strict`. A request without it may leave an optional field out, so the bare shape's
  // parse writes the missing nulls first. This wraps zod's own entry point for the one schema built here (its JSON Schema is read from its
  // definition and is untouched); `__tests__/strict-input.test.ts` pins that an input with fields left out still parses.
  const internals = (b.schema as unknown as { _zod: { run: (payload: { value: unknown }, ctx: unknown) => unknown } })._zod;
  const run = internals.run;
  internals.run = (payload, ctx) => {
    payload.value = b.fill(payload.value);
    return run(payload, ctx);
  };
  const strict = b.schema.transform((value) => b.clean(value)).pipe(schema) as unknown as z.ZodType<I>;
  built.set(schema, strict);
  return strict;
}

/** Every way a JSON Schema breaks the strict rules, as paths. Empty means the API will take it with `strict: true`. */
export function strictProblems(schema: unknown, path = '$'): string[] {
  if (!schema || typeof schema !== 'object') return [];
  if (Array.isArray(schema)) return schema.flatMap((s, i) => strictProblems(s, `${path}[${i}]`));
  const node = schema as Record<string, unknown>;
  const problems: string[] = [];
  for (const banned of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems', 'prefixItems', 'uniqueItems', 'default']) if (banned in node) problems.push(`${path}: ${banned}`);
  if (node.type === 'object' || node.properties) {
    const keys = Object.keys((node.properties as Record<string, unknown> | undefined) ?? {});
    if (node.additionalProperties !== false) problems.push(`${path}: additionalProperties is not false`);
    const required = new Set((node.required as string[] | undefined) ?? []);
    for (const k of keys) if (!required.has(k)) problems.push(`${path}.${k}: not required`);
  }
  if (Object.keys(node).length === 0) problems.push(`${path}: no type`);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'properties') for (const [k, v] of Object.entries(value as Record<string, unknown>)) problems.push(...strictProblems(v, `${path}.${k}`));
    else if (key === 'items' || key === 'anyOf' || key === 'allOf') problems.push(...strictProblems(value, `${path}.${key}`));
  }
  return problems;
}
