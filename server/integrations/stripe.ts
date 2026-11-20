// Stripe sandbox payments (K-integrations, R-rails). TEST MODE ONLY: refuses live keys. Owner hz.
// Shared Payment Token (SPT, preview) capped at the user's mandate → real test-mode pi_….
import { randomUUID } from 'node:crypto';
import { http, IntegrationError, requireEnv, timed } from './_lib.ts';

const BASE = 'https://api.stripe.com/v1';
const PREVIEW = process.env.STRIPE_PREVIEW_VERSION ?? '2026-09-30.preview';
const S = 'stripe';

function key(): string {
  const k = requireEnv('STRIPE_SECRET_KEY');
  if (!/^(sk|rk)_test_/.test(k)) throw new IntegrationError(S, 0, 'STRIPE_SECRET_KEY is not a test-mode key (sk_test_/rk_test_); refusing', 'live_key_refused');
  return k;
}
const auth = (extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${key()}`, ...extra });
const cents = (usd: number) => {
  const c = Math.round(usd * 100);
  if (!Number.isFinite(c) || c <= 0) throw new IntegrationError(S, 0, `bad amount ${usd}`, 'bad_amount');
  return c;
};

/** Mint a test SPT that can spend at most maxUsd before expiresAt. */
export function mintSpt(maxUsd: number, expiresAt: Date) {
  return timed(async () => {
    const form = new URLSearchParams({
      payment_method: 'pm_card_visa',
      'usage_limits[currency]': 'usd',
      'usage_limits[max_amount]': String(cents(maxUsd)),
      'usage_limits[expires_at]': String(Math.floor(expiresAt.getTime() / 1000)),
    });
    const { data } = await http(S, `${BASE}/test_helpers/shared_payment/granted_tokens`, {
      headers: auth({ 'Stripe-Version': PREVIEW, 'Idempotency-Key': randomUUID() }),
      form,
    });
    return { sptId: data.id as string, maxUsd, expiresAt: expiresAt.toISOString() };
  });
}

/**
 * Create + confirm a test PaymentIntent.
 * sptId given → pays with the SPT (Stripe enforces its cap; over-cap throws IntegrationError).
 * sptId null  → fallback pm_card_visa (still a real test pi_; the cap must then be enforced by our policy).
 * One Idempotency-Key per call, reused across retries, so a retry can never double-charge.
 */
export function pay(sptId: string | null, amountUsd: number, meta: Record<string, string> = {}) {
  return timed(async () => {
    const form = new URLSearchParams({ amount: String(cents(amountUsd)), currency: 'usd', confirm: 'true' });
    for (const [k, v] of Object.entries(meta)) form.set(`metadata[${k}]`, String(v).slice(0, 500));
    const extra: Record<string, string> = { 'Idempotency-Key': randomUUID() };
    if (sptId) {
      form.set('payment_method_data[shared_payment_granted_token]', sptId);
      extra['Stripe-Version'] = PREVIEW;
    } else {
      form.set('payment_method', 'pm_card_visa');
      form.append('payment_method_types[]', 'card');
    }
    const { data } = await http(S, `${BASE}/payment_intents`, { headers: auth(extra), form });
    if (data?.livemode) throw new IntegrationError(S, 0, 'got a livemode PaymentIntent; aborting', 'livemode');
    return { paymentIntentId: data.id as string, status: data.status as string, amountUsd, mode: 'test' as const, via: sptId ? ('spt' as const) : ('pm_card_visa' as const) };
  });
}
