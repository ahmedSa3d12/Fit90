import { Decimal } from '@prisma/client/runtime/library';

export function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export function mapRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'is_deleted') continue;
    const camel = snakeToCamel(k);
    if (v instanceof Decimal) out[camel] = Number(v);
    else if (v instanceof Date) out[camel] = v.toISOString();
    else out[camel] = v;
  }
  return out;
}

export function bodyToDb(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue;
    out[camelToSnake(k)] = v;
  }
  return out;
}

export function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v) || 0;
  if (v instanceof Decimal) return Number(v);
  return Number(v) || 0;
}
