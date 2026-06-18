import { ENV } from "../_core/env";

/** Lifecycle states mirrored from a billing provider's subscription object. */
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete";

export type CheckoutResult = {
  /** URL to redirect the customer to, or null for providers/stubs with none. */
  url: string | null;
};

export type WebhookResult = {
  handled: boolean;
  /** Affected tenant, when the event could be mapped to one. */
  tenantId?: number;
};

/**
 * Provider-agnostic billing seam. Real providers (Stripe / Paddle / Lemon
 * Squeezy) implement this; the stub records intent locally so the rest of the
 * app (plan assignment, quota binding, status → tenant suspension) can be built
 * and tested without an external account. Swap via BILLING_PROVIDER env.
 */
export interface BillingProvider {
  readonly id: string;
  /** Begin a subscription/checkout for a tenant. */
  createCheckout(params: {
    tenantId: number;
    planId: string;
  }): Promise<CheckoutResult>;
  /** Cancel a tenant's subscription at the provider. */
  cancel(params: { tenantId: number }): Promise<void>;
  /** Verify + interpret an inbound webhook. Returns what it mapped. */
  handleWebhook(params: {
    body: unknown;
    signature: string | undefined;
  }): Promise<WebhookResult>;
}

/**
 * No-op provider used until a real one is wired. createCheckout returns no URL
 * (the admin assigns plans directly), and webhooks are acknowledged but carry
 * no provider semantics. Deliberately has no external dependencies.
 */
export class StubBillingProvider implements BillingProvider {
  readonly id = "stub";

  async createCheckout(): Promise<CheckoutResult> {
    return { url: null };
  }

  async cancel(): Promise<void> {
    // Nothing to cancel externally; local subscription state is updated by the
    // caller (adminRouter / db.cancelSubscription).
  }

  async handleWebhook(): Promise<WebhookResult> {
    return { handled: false };
  }
}

let _provider: BillingProvider | null = null;

/**
 * The active billing provider, chosen by BILLING_PROVIDER env (default "stub").
 * Real providers can be registered here as they're added.
 */
export function getBillingProvider(): BillingProvider {
  if (_provider) return _provider;
  switch (ENV.billingProvider) {
    // case "stripe": _provider = new StripeBillingProvider(); break;
    default:
      _provider = new StubBillingProvider();
  }
  return _provider;
}

/** Test seam: override the cached provider. */
export function _setBillingProvider(p: BillingProvider | null): void {
  _provider = p;
}
