// Minimal JSON Schema (2020-12) validator for the contract tests: exactly the
// keywords the harness view schemas use, nothing else. An unknown keyword is
// an error, so a schema update that needs more is noticed, not ignored.

type Schema = Record<string, unknown>;

const KNOWN = new Set([
  '$id',
  '$schema',
  'title',
  'description',
  'type',
  'const',
  'minItems',
  'enum',
  'anyOf',
  'properties',
  'required',
  'additionalProperties',
  'propertyNames',
  'items',
  'maxItems',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'pattern',
  'format',
]);

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function typeOk(type: string, v: unknown): boolean {
  switch (type) {
    case 'object':
      return isObj(v);
    case 'array':
      return Array.isArray(v);
    case 'string':
      return typeof v === 'string';
    case 'boolean':
      return typeof v === 'boolean';
    case 'null':
      return v === null;
    case 'number':
      return typeof v === 'number' && Number.isFinite(v);
    case 'integer':
      return Number.isInteger(v);
    default:
      throw new Error(`unsupported type ${type}`);
  }
}

/** Errors as `path: reason`; empty = valid. */
export function validate(schema: Schema, value: unknown, path = '$'): string[] {
  for (const k of Object.keys(schema))
    if (!KNOWN.has(k)) throw new Error(`unsupported keyword ${k} at ${path}`);
  const out: string[] = [];
  const err = (why: string) => out.push(`${path}: ${why}`);
  if (schema.anyOf) {
    const branches = (schema.anyOf as Schema[]).map((s) => validate(s, value, path));
    if (!branches.some((b) => b.length === 0))
      err('no anyOf branch matches: ' + branches.map((b) => b[0]).join(' | '));
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
    if (!types.some((t) => typeOk(t, value))) {
      err(`expected ${types.join('|')}`);
      return out;
    }
  }
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(value))
    err(`expected const ${JSON.stringify(schema.const)}`);
  if (schema.enum && !(schema.enum as unknown[]).some((e) => e === value))
    err(`not in enum ${JSON.stringify(schema.enum)}`);
  if (typeof value === 'string') {
    const len = [...value].length;
    if (schema.minLength !== undefined && len < (schema.minLength as number)) err('too short');
    if (schema.maxLength !== undefined && len > (schema.maxLength as number)) err('too long');
    if (schema.pattern !== undefined && !new RegExp(schema.pattern as string, 'u').test(value))
      err('pattern mismatch');
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < (schema.minimum as number)) err('below minimum');
    if (schema.maximum !== undefined && value > (schema.maximum as number)) err('above maximum');
    if (schema.exclusiveMinimum !== undefined && value <= (schema.exclusiveMinimum as number))
      err('not above exclusiveMinimum');
  }
  if (Array.isArray(value)) {
    if (schema.maxItems !== undefined && value.length > (schema.maxItems as number))
      err('too many items');
    if (schema.minItems !== undefined && value.length < (schema.minItems as number))
      err('too few items');
    if (schema.items)
      value.forEach((v, i) => out.push(...validate(schema.items as Schema, v, `${path}[${i}]`)));
  }
  if (isObj(value)) {
    const props = (schema.properties ?? {}) as Record<string, Schema>;
    for (const r of (schema.required ?? []) as string[])
      if (!Object.hasOwn(value, r)) err(`missing ${r}`);
    for (const [k, v] of Object.entries(value)) {
      if (schema.propertyNames)
        out.push(...validate(schema.propertyNames as Schema, k, `${path}{${k}}`));
      if (Object.hasOwn(props, k)) out.push(...validate(props[k]!, v, `${path}.${k}`));
      else if (schema.additionalProperties === false) err(`unknown field ${k}`);
      else if (isObj(schema.additionalProperties))
        out.push(...validate(schema.additionalProperties, v, `${path}.${k}`));
    }
  }
  return out;
}
