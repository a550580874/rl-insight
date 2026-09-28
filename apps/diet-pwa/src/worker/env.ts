import type { Database } from './db';

/** Worker bindings declared in wrangler.toml. */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

export interface AuthContext {
  authenticated: boolean;
  token: string | null;
  sessionId: number | null;
}

export interface Ctx {
  request: Request;
  env: Env;
  url: URL;
  params: Record<string, string>;
  db: Database;
  auth: AuthContext;
}

export type Handler = (ctx: Ctx) => Promise<Response> | Response;

export interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Path pattern, e.g. /api/foods/:id */
  pattern: string;
  handler: Handler;
  /** 'none' keeps the route reachable before unlocking (auth endpoints). */
  auth?: 'required' | 'none';
}
