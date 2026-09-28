/** Minimal HTTP helpers shared by the Worker route handlers. */

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(status: number, code: string, message: string, extraHeaders?: HeadersInit): Response {
  return json({ error: code, message }, { status, headers: extraHeaders });
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return errorResponse(error.status, error.code, error.message);
  }
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return errorResponse(500, 'internal_error', message);
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be valid JSON');
  }
}

export function requiredString(value: unknown, field: string, maxLength = 100): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, 'invalid_field', `${field} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new HttpError(400, 'invalid_field', `${field} must be at most ${maxLength} characters`);
  }
  return trimmed;
}

export function finiteNumber(value: unknown, field: string, opts: { min?: number; max?: number } = {}): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    throw new HttpError(400, 'invalid_field', `${field} must be a finite number`);
  }
  if (opts.min !== undefined && parsed < opts.min) {
    throw new HttpError(400, 'invalid_field', `${field} must be >= ${opts.min}`);
  }
  if (opts.max !== undefined && parsed > opts.max) {
    throw new HttpError(400, 'invalid_field', `${field} must be <= ${opts.max}`);
  }
  return parsed;
}

export function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  return fallback;
}

export function optionalNumber(value: unknown, field: string, opts: { min?: number; max?: number } = {}): number | null {
  if (value === null || value === undefined || value === '') return null;
  return finiteNumber(value, field, opts);
}

export function optionalString(value: unknown, maxLength = 20): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, maxLength);
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isoDate(value: unknown, field = 'date'): string {
  const raw = requiredString(value, field, 10);
  if (!DATE_PATTERN.test(raw)) {
    throw new HttpError(400, 'invalid_field', `${field} must use the YYYY-MM-DD format`);
  }
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, 'invalid_field', `${field} is not a valid calendar date`);
  }
  return raw;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new HttpError(400, 'invalid_field', `${field} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}
