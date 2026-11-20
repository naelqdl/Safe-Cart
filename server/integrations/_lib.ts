// Shared helpers for the sponsor clients (T11, owner hz). No agent logic here.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Load keys from .env files once. Repo-root .env first, then server/.env.
// Values already set in the real environment win (loadEnvFile does not overwrite).
let envLoaded = false;
export function loadEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  for (const p of [resolve(here, '../../.env'), resolve(here, '../.env'), resolve(here, '.env')]) {
    if (existsSync(p)) process.loadEnvFile(p);
  }
}

export class MissingKeyError extends Error {
  constructor(public readonly envVar: string) {
    super(`missing env var ${envVar} (put it in the repo's .env)`);
    this.name = 'MissingKeyError';
  }
}

export function requireEnv(name: string): string {
  loadEnv();
  const v = process.env[name]?.trim();
  if (!v) throw new MissingKeyError(name);
  return v;
}

/** Error from a sponsor API, with the HTTP status and the provider's error code if any. */
export class IntegrationError extends Error {
  constructor(
    public readonly service: string,
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly body?: unknown,
  ) {
    super(`${service} ${status}${code ? ` ${code}` : ''}: ${message}`);
    this.name = 'IntegrationError';
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface HttpOptions {
  method?: string;
  headers?: Record<string, string>;
  json?: unknown;
  form?: URLSearchParams;
  /** Retries on 429/5xx/network errors (default 2, per K-integrations). */
  retries?: number;
  timeoutMs?: number;
}

/**
 * fetch + JSON with 2 retries on 429/5xx/network errors (exponential backoff,
 * honours Retry-After). Callers that POST money movements MUST pass an
 * Idempotency-Key header so a retry can never double-charge.
 */
export async function http<T = any>(service: string, url: string, o: HttpOptions = {}): Promise<{ status: number; data: T }> {
  const retries = o.retries ?? 2;
  const headers: Record<string, string> = { Accept: 'application/json', ...o.headers };
  let body: string | undefined;
  if (o.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(o.json);
  } else if (o.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = o.form.toString();
  }
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: o.method ?? (body ? 'POST' : 'GET'),
        headers,
        body,
        signal: AbortSignal.timeout(o.timeoutMs ?? 60_000),
      });
    } catch (e) {
      if (attempt < retries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw new IntegrationError(service, 0, `network error: ${(e as Error).message}`);
    }
    const text = await res.text();
    let data: any = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON body: keep text */
    }
    if (res.ok) return { status: res.status, data };
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const ra = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 30) * 1000 : 500 * 2 ** attempt);
      continue;
    }
    const err = data?.error ?? data;
    const msg = typeof err === 'string' ? err : err?.message ?? err?.detail ?? JSON.stringify(err)?.slice(0, 300) ?? res.statusText;
    throw new IntegrationError(service, res.status, String(msg), err?.code ?? err?.type, data);
  }
}

/** Runs fn and returns its result with latencyMs (wall clock) added. */
export async function timed<T extends object>(fn: () => Promise<T>): Promise<T & { latencyMs: number }> {
  const t0 = performance.now();
  const r = await fn();
  return Object.assign(r, { latencyMs: Math.round(performance.now() - t0) });
}

/** Smoke-test runner: one OK/FAIL/SKIP line per check; exit 1 on any FAIL. */
export async function smoke(service: string, checks: [string, () => Promise<string>][]): Promise<void> {
  let failed = 0;
  for (const [name, fn] of checks) {
    try {
      const note = await fn();
      console.log(`OK   ${service}.${name}${note ? ` | ${note}` : ''}`);
    } catch (e) {
      if (e instanceof MissingKeyError) {
        console.log(`SKIP ${service}.${name} | ${e.message}`);
        failed++;
      } else {
        console.log(`FAIL ${service}.${name} | ${(e as Error).message}`);
        failed++;
      }
    }
  }
  process.exitCode = failed ? 1 : 0;
}
