/** Apró séma-validátor adatcsomagokhoz (pályák, tárgyak). */
export type Schema =
  | { type: 'number'; min?: number; max?: number; optional?: boolean }
  | { type: 'string'; oneOf?: readonly string[]; optional?: boolean }
  | { type: 'boolean'; optional?: boolean }
  | { type: 'array'; items: Schema; minLength?: number; maxLength?: number; optional?: boolean }
  | { type: 'object'; fields: Record<string, Schema>; optional?: boolean }
  | { type: 'record'; values: Schema; optional?: boolean };

/** Hibák listája; üres lista = érvényes. */
export function validate(value: unknown, schema: Schema, path = '$'): string[] {
  if (value === undefined) return schema.optional ? [] : [`${path}: hiányzik`];
  switch (schema.type) {
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value)) return [`${path}: szám kell`];
      if (schema.min !== undefined && value < schema.min) return [`${path}: legalább ${schema.min}`];
      if (schema.max !== undefined && value > schema.max) return [`${path}: legfeljebb ${schema.max}`];
      return [];
    case 'string':
      if (typeof value !== 'string') return [`${path}: szöveg kell`];
      if (schema.oneOf && !schema.oneOf.includes(value)) return [`${path}: ismeretlen érték "${value}"`];
      return [];
    case 'boolean':
      return typeof value === 'boolean' ? [] : [`${path}: logikai érték kell`];
    case 'array': {
      if (!Array.isArray(value)) return [`${path}: tömb kell`];
      const errs: string[] = [];
      if (schema.minLength !== undefined && value.length < schema.minLength)
        errs.push(`${path}: legalább ${schema.minLength} elem`);
      if (schema.maxLength !== undefined && value.length > schema.maxLength)
        errs.push(`${path}: legfeljebb ${schema.maxLength} elem`);
      value.forEach((v, i) => errs.push(...validate(v, schema.items, `${path}[${i}]`)));
      return errs;
    }
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${path}: objektum kell`];
      const errs: string[] = [];
      for (const [k, s] of Object.entries(schema.fields))
        errs.push(...validate((value as Record<string, unknown>)[k], s, `${path}.${k}`));
      return errs;
    }
    case 'record': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${path}: objektum kell`];
      return Object.entries(value).flatMap(([k, v]) => validate(v, schema.values, `${path}.${k}`));
    }
  }
}
