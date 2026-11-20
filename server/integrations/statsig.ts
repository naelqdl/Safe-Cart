// Statsig server client: purchase policy (dynamic config) + recall guard (gate). Owner hz.
// SDK: @statsig/statsig-node-core (native NAPI binary; ships as an optional platform package, no postinstall).
// Config sync: specsSyncIntervalMs is set to 5000 below (SDK default is 10 s), so console edits
// to `purchase_policy` / `recall_guard` show up within ~5-10 s. Gate/config reads are local (no network per call).
// Console objects (created by a human): dynamic config `purchase_policy`
// {"autoBuyLimit":150,"minDiscountPct":20,"autonomy":"auto"} and feature gate `recall_guard`.
import { Statsig, StatsigUser } from '@statsig/statsig-node-core';
import { requireEnv, timed } from './_lib.ts';

const INIT_TIMEOUT_MS = 5_000;
const RETRY_INIT_MS = 30_000;
const SYNC_INTERVAL_MS = 5_000;

export interface Policy {
  autoBuyLimit: number;
  minDiscountPct: number;
  autonomy: 'auto' | 'ask_first';
  recallGuard: boolean;
  source: 'statsig' | 'default';
  latencyMs: number;
  error?: string;
}

const DEFAULTS = { autoBuyLimit: 150, minDiscountPct: 20, autonomy: 'auto' as 'auto' | 'ask_first', recallGuard: true };

let client: Statsig | null = null;
let initPromise: Promise<Statsig> | null = null;
let lastFailAt = 0;
let lastFailMsg = '';

function getClient(): Promise<Statsig> {
  if (initPromise) return initPromise;
  if (lastFailAt && Date.now() - lastFailAt < RETRY_INIT_MS) {
    return Promise.reject(new Error(`statsig init failed ${Math.round((Date.now() - lastFailAt) / 1000)}s ago (retry every 30s): ${lastFailMsg}`));
  }
  const key = requireEnv('STATSIG_SERVER_KEY'); // throws MissingKeyError (caught by callers)
  const s = new Statsig(key, {
    initTimeoutMs: INIT_TIMEOUT_MS,
    specsSyncIntervalMs: SYNC_INTERVAL_MS,
    outputLogLevel: 'none',
  });
  const p = (async () => {
    let timer: NodeJS.Timeout | undefined;
    try {
      const res = await Promise.race([
        s.initialize(),
        new Promise<never>((_, rej) => {
          timer = setTimeout(() => rej(new Error(`statsig init timed out after ${INIT_TIMEOUT_MS}ms`)), INIT_TIMEOUT_MS + 500);
        }),
      ]);
      if (!res.isSuccess) throw new Error(`statsig init failed: ${res.error ?? 'unknown'}`);
      client = s;
      return s;
    } catch (e) {
      lastFailAt = Date.now();
      lastFailMsg = (e as Error).message;
      initPromise = null;
      s.shutdown(1000).catch(() => {}); // release timers so the process can exit
      throw e;
    } finally {
      clearTimeout(timer);
    }
  })();
  initPromise = p;
  return p;
}

const user = (userId: string) => new StatsigUser({ userID: userId });

/** Never throws. Falls back to defaults (source "default", error set) on missing key / init failure / bad call. */
export async function getPolicy(userId = 'maya'): Promise<Policy> {
  return timed(async (): Promise<Omit<Policy, 'latencyMs'>> => {
    try {
      const s = await getClient();
      const u = user(userId);
      const cfg = s.getDynamicConfig(u, 'purchase_policy').value ?? {};
      // Fail safe: checkGate() returns false for a gate that doesn't exist, which would silently turn
      // SafeCart into the naive agent. Only trust the gate if it is defined in the project.
      const gateDefined = s.getFeatureGateList().includes('recall_guard');
      const recallGuard = gateDefined ? s.checkGate(u, 'recall_guard') : DEFAULTS.recallGuard;
      const gateErr = gateDefined ? undefined : 'feature gate recall_guard not defined in Statsig (guard kept ON)';
      if (Object.keys(cfg).length === 0) {
        return { ...DEFAULTS, recallGuard, source: 'default', error: ['dynamic config purchase_policy not found or empty (using defaults)', gateErr].filter(Boolean).join('; ') };
      }
      const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
      return {
        autoBuyLimit: num(cfg.autoBuyLimit, DEFAULTS.autoBuyLimit),
        minDiscountPct: num(cfg.minDiscountPct, DEFAULTS.minDiscountPct),
        autonomy: cfg.autonomy === 'auto' || cfg.autonomy === 'ask_first' ? cfg.autonomy : DEFAULTS.autonomy,
        recallGuard,
        source: 'statsig',
        ...(gateErr ? { error: gateErr } : {}),
      };
    } catch (e) {
      return { ...DEFAULTS, source: 'default', error: (e as Error).message };
    }
  }) as Promise<Policy>;
}

/** Fire-and-forget event. No-op if Statsig is not initialized. Never throws. */
export function logEvent(userId: string, name: string, value?: string | number, metadata?: Record<string, string>): void {
  if (!client) return;
  try {
    client.logEvent(user(userId), name, value ?? null, metadata ?? null);
  } catch {
    /* telemetry must never break the agent loop */
  }
}

export async function flush(): Promise<void> {
  if (!client) return;
  try {
    await client.flushEvents();
  } catch {
    /* ignore */
  }
}

export async function shutdown(): Promise<void> {
  const c = client;
  client = null;
  initPromise = null;
  if (!c) return;
  try {
    await c.shutdown(3000);
  } catch {
    /* ignore */
  }
}
