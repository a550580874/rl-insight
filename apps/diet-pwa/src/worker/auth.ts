/**
 * PIN protection and long lived sessions.
 *
 * Design (deliberately small - this is a single-user app, not an account
 * system):
 *   - the PIN is never stored, only a PBKDF2-SHA256 hash with a random 16 byte
 *     salt and 210k iterations;
 *   - a successful unlock issues a random 32 byte session token, stored in D1
 *     as a SHA-256 hash, delivered as an HttpOnly cookie, valid for 30 days;
 *   - repeated wrong PINs lock the endpoint for a while (see AUTH_LOCKOUT).
 */

const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const TOKEN_BYTES = 32;
const SESSION_TTL_DAYS = 30;

export const SESSION_COOKIE = 'diet_session';

export const AUTH_LOCKOUT = {
  maxFailedAttempts: 8,
  lockMinutes: 15,
} as const;

export const PIN_PATTERN = /^\d{4,8}$/;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function randomSalt(): string {
  const bytes = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64(bytes);
}

export function randomToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hashPin(pin: string, salt: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt), iterations },
    keyMaterial,
    256,
  );
  return toBase64(new Uint8Array(bits));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return toHex(digest);
}

/** Constant-time string comparison so PIN checks do not leak timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function parseCookies(header: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

export function sessionCookie(token: string, requestUrl: string, maxAgeSeconds = SESSION_TTL_DAYS * 24 * 60 * 60): string {
  const secure = new URL(requestUrl).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearedSessionCookie(requestUrl: string): string {
  return sessionCookie('', requestUrl, 0);
}

export function sessionExpiry(from: Date = new Date()): string {
  const expires = new Date(from.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  return expires.toISOString();
}
