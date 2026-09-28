/**
 * Cloudflare Worker entry point for the diet PWA.
 *
 * Static assets (the Vite build output) are served by the asset binding; this
 * Worker only owns `/api/*` (see `run_worker_first` in wrangler.toml) and
 * therefore exposes a small JSON API.
 */

import type { Ctx, Env, Route } from './env';
import { HttpError, errorResponse, json, toErrorResponse } from './http';
import { authChangePin, authLogout, authPin, authStatus, resolveAuth } from './handlers/auth';
import { createFoodHandler, deleteFoodHandler, listFoodsHandler, updateFoodHandler } from './handlers/foods';
import { copyRecordHandler, getRecordHandler, listRecordsHandler, putRecordHandler } from './handlers/records';
import { getSettingsHandler, updateSettingsHandler } from './handlers/settings';

const routes: Route[] = [
  { method: 'GET', pattern: '/api/health', handler: health, auth: 'none' },

  { method: 'GET', pattern: '/api/auth/status', handler: authStatus, auth: 'none' },
  { method: 'POST', pattern: '/api/auth/pin', handler: authPin, auth: 'none' },
  { method: 'POST', pattern: '/api/auth/pin/change', handler: authChangePin, auth: 'required' },
  { method: 'POST', pattern: '/api/auth/logout', handler: authLogout, auth: 'none' },

  { method: 'GET', pattern: '/api/foods', handler: listFoodsHandler },
  { method: 'POST', pattern: '/api/foods', handler: createFoodHandler },
  { method: 'PUT', pattern: '/api/foods/:id', handler: updateFoodHandler },
  { method: 'DELETE', pattern: '/api/foods/:id', handler: deleteFoodHandler },

  { method: 'GET', pattern: '/api/settings', handler: getSettingsHandler },
  { method: 'PUT', pattern: '/api/settings', handler: updateSettingsHandler },

  { method: 'GET', pattern: '/api/records', handler: listRecordsHandler },
  { method: 'POST', pattern: '/api/records/copy', handler: copyRecordHandler },
  { method: 'GET', pattern: '/api/records/:date', handler: getRecordHandler },
  { method: 'PUT', pattern: '/api/records/:date', handler: putRecordHandler },
];

async function health(ctx: Ctx): Promise<Response> {
  const row = await ctx.db.prepare('SELECT count(*) AS count FROM foods').first<{ count: number }>();
  return json({ status: 'ok', foods: row?.count ?? 0 });
}

/** Match `/api/foods/:id` style patterns. */
export function matchRoute(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const expected = patternParts[i] ?? '';
    const actual = pathParts[i] ?? '';
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(actual);
      continue;
    }
    if (expected !== actual) return null;
  }
  return params;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      // Assets normally short-circuit before the Worker runs; this keeps
      // `wrangler dev` and direct Worker fetches working too.
      return env.ASSETS.fetch(request);
    }

    try {
      const method = request.method.toUpperCase();
      for (const route of routes) {
        if (route.method !== method) continue;
        const params = matchRoute(route.pattern, url.pathname);
        if (!params) continue;

        const auth = await resolveAuth(env.DB, request);
        if ((route.auth ?? 'required') === 'required' && !auth.authenticated) {
          return errorResponse(401, 'unauthorized', '请先输入 PIN 解锁');
        }

        const ctx: Ctx = { request, env, url, params, db: env.DB, auth };
        return await route.handler(ctx);
      }

      if (url.pathname === '/api' || url.pathname === '/api/') {
        return json({ name: 'diet-pwa', status: 'ok' });
      }
      throw new HttpError(404, 'not_found', `未知接口 ${method} ${url.pathname}`);
    } catch (error) {
      return toErrorResponse(error);
    }
  },
};
