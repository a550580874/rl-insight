import type { AuthStatus } from '../../shared/types';
import {
  AUTH_LOCKOUT,
  PIN_PATTERN,
  SESSION_COOKIE,
  clearedSessionCookie,
  hashPin,
  parseCookies,
  randomSalt,
  randomToken,
  sessionCookie,
  sessionExpiry,
  sha256Hex,
  timingSafeEqual,
} from '../auth';
import {
  clearFailedAttempts,
  createSession,
  deleteSession,
  findValidSession,
  getCredentials,
  registerFailedAttempt,
  setCredentials,
  touchSession,
} from '../db';
import type { AuthContext, Ctx } from '../env';
import { HttpError, json, readJson } from '../http';

const PIN_ITERATIONS = 210_000;

function readPin(body: { pin?: unknown; newPin?: unknown }, field: 'pin' | 'newPin'): string {
  const raw = body[field];
  if (typeof raw !== 'string' || !PIN_PATTERN.test(raw)) {
    throw new HttpError(400, 'invalid_pin', 'PIN 必须是 4-8 位数字');
  }
  return raw;
}

function lockedUntilDate(lockedUntil: string | null): Date | null {
  if (!lockedUntil) return null;
  const normalized = lockedUntil.includes('T') ? lockedUntil : `${lockedUntil.replace(' ', 'T')}Z`;
  const parsed = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function authStatus(ctx: Ctx): Promise<Response> {
  const credentials = await getCredentials(ctx.db);
  const status: AuthStatus = {
    pinConfigured: credentials !== null,
    authenticated: ctx.auth.authenticated,
  };
  return json(status);
}

/** First call configures the PIN; later calls unlock with it. */
export async function authPin(ctx: Ctx): Promise<Response> {
  const body = await readJson<{ pin?: unknown }>(ctx.request);
  const pin = readPin(body, 'pin');
  const credentials = await getCredentials(ctx.db);

  if (!credentials) {
    const salt = randomSalt();
    const hash = await hashPin(pin, salt, PIN_ITERATIONS);
    await setCredentials(ctx.db, hash, salt, PIN_ITERATIONS);
    const issued = await issueSession(ctx);
    return json({ ok: true, created: true, pinConfigured: true }, { headers: { 'set-cookie': issued.cookie } });
  }

  const locked = lockedUntilDate(credentials.locked_until);
  if (locked && locked.getTime() > Date.now()) {
    const minutes = Math.ceil((locked.getTime() - Date.now()) / 60_000);
    throw new HttpError(429, 'pin_locked', `尝试次数过多，请在 ${minutes} 分钟后重试`);
  }

  const candidate = await hashPin(pin, credentials.pin_salt, credentials.iterations ?? PIN_ITERATIONS);
  if (!timingSafeEqual(candidate, credentials.pin_hash)) {
    if (credentials.failed_attempts + 1 >= AUTH_LOCKOUT.maxFailedAttempts) {
      await registerFailedAttempt(ctx.db, new Date(Date.now() + AUTH_LOCKOUT.lockMinutes * 60_000).toISOString());
      throw new HttpError(429, 'pin_locked', `尝试次数过多，请在 ${AUTH_LOCKOUT.lockMinutes} 分钟后重试`);
    }
    await registerFailedAttempt(ctx.db, null);
    throw new HttpError(401, 'invalid_pin', 'PIN 不正确');
  }

  await clearFailedAttempts(ctx.db);
  const issued = await issueSession(ctx);
  return json({ ok: true, created: false, pinConfigured: true }, { headers: { 'set-cookie': issued.cookie } });
}

export async function authChangePin(ctx: Ctx): Promise<Response> {
  const body = await readJson<{ pin?: unknown; newPin?: unknown }>(ctx.request);
  const currentPin = readPin(body, 'pin');
  const newPin = readPin(body, 'newPin');

  const credentials = await getCredentials(ctx.db);
  if (!credentials) throw new HttpError(400, 'pin_not_configured', '尚未设置 PIN');

  const candidate = await hashPin(currentPin, credentials.pin_salt, credentials.iterations ?? PIN_ITERATIONS);
  if (!timingSafeEqual(candidate, credentials.pin_hash)) {
    throw new HttpError(401, 'invalid_pin', '当前 PIN 不正确');
  }

  const salt = randomSalt();
  const hash = await hashPin(newPin, salt, PIN_ITERATIONS);
  await setCredentials(ctx.db, hash, salt, PIN_ITERATIONS);
  return json({ ok: true });
}

export async function authLogout(ctx: Ctx): Promise<Response> {
  if (ctx.auth.token) {
    await deleteSession(ctx.db, await sha256Hex(ctx.auth.token));
  }
  return json({ ok: true }, { headers: { 'set-cookie': clearedSessionCookie(ctx.url.toString()) } });
}

async function issueSession(ctx: Ctx): Promise<{ token: string; cookie: string }> {
  const token = randomToken();
  await createSession(ctx.db, await sha256Hex(token), sessionExpiry());
  return { token, cookie: sessionCookie(token, ctx.url.toString()) };
}

/** Reads the session cookie and validates it against D1. */
export async function resolveAuth(db: Ctx['db'], request: Request): Promise<AuthContext> {
  const cookies = parseCookies(request.headers.get('cookie'));
  const token = cookies[SESSION_COOKIE];
  if (!token) return { authenticated: false, token: null, sessionId: null };

  const session = await findValidSession(db, await sha256Hex(token));
  if (!session) return { authenticated: false, token: null, sessionId: null };

  await touchSession(db, session.id);
  return { authenticated: true, token, sessionId: session.id };
}
