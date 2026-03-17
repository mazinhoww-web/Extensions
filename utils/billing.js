/**
 * Billing utilities for MeetScribe — Stripe Checkout + Customer Portal.
 *
 * The extension opens Stripe Checkout in a new tab. The checkout session
 * is created by the backend (Vercel/Railway) using the service_role key.
 * After payment, Stripe webhook updates the user's plan in Supabase.
 */

import { getSessionToken, getCurrentUserId } from './supabase.js';

// Backend API base URL — update when deploying
const BACKEND_URL = 'https://api.meetscribe.app'; // TODO: update after deploy

/**
 * Plan IDs — matches Stripe Price IDs configured in the backend.
 * The backend maps these slugs to the actual Stripe price_ids.
 */
const PLANS = {
  pro_monthly:  'pro_monthly',
  pro_annual:   'pro_annual',
  team_monthly: 'team_monthly',
  team_annual:  'team_annual',
};

/**
 * Open Stripe Checkout for the given plan.
 * Creates a checkout session via the backend, then opens it in a new tab.
 *
 * @param {'pro_monthly'|'pro_annual'|'team_monthly'|'team_annual'} planId
 * @param {string} [successPath='/success'] - path to redirect after payment
 */
async function openCheckout(planId, successPath = '/success') {
  const token = await getSessionToken();
  const userId = await getCurrentUserId();

  if (!token || !userId) {
    // Not logged in — redirect to dashboard login first
    chrome.tabs.create({ url: 'https://app.meetscribe.app/login?next=upgrade' });
    return;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/billing/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        plan: planId,
        success_url: `https://app.meetscribe.app${successPath}`,
        cancel_url:  'https://app.meetscribe.app/upgrade?canceled=1',
      }),
    });

    if (!res.ok) throw new Error(`Checkout API error: ${res.status}`);

    const { url } = await res.json();
    if (url) {
      chrome.tabs.create({ url });
    }
  } catch (e) {
    console.error('[billing] Failed to create checkout session:', e);
    // Fallback: open upgrade page directly
    chrome.tabs.create({ url: 'https://app.meetscribe.app/upgrade' });
  }
}

/**
 * Open the Stripe Customer Portal so the user can manage their subscription
 * (cancel, change plan, update payment method).
 */
async function openCustomerPortal() {
  const token = await getSessionToken();
  if (!token) {
    chrome.tabs.create({ url: 'https://app.meetscribe.app/login' });
    return;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/billing/portal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        return_url: 'https://app.meetscribe.app/settings',
      }),
    });

    if (!res.ok) throw new Error(`Portal API error: ${res.status}`);

    const { url } = await res.json();
    if (url) chrome.tabs.create({ url });
  } catch (e) {
    console.error('[billing] Failed to open customer portal:', e);
    chrome.tabs.create({ url: 'https://app.meetscribe.app/settings' });
  }
}

/**
 * Human-readable label for a plan ID.
 */
function getPlanLabel(plan) {
  const labels = {
    free: 'Plano Free',
    pro: 'Pro',
    team: 'Team',
    enterprise: 'Enterprise',
  };
  return labels[plan] || plan;
}

/**
 * Check if a feature is available on the given plan.
 *
 * @param {string} feature - feature key (see FEATURES below)
 * @param {'free'|'pro'|'team'|'enterprise'} plan
 * @returns {boolean}
 */
function isPlanFeatureEnabled(feature, plan) {
  return FEATURES[feature]?.includes(plan) ?? false;
}

const FEATURES = {
  unlimited_minutes:  ['pro', 'team', 'enterprise'],
  export_googledocs:  ['pro', 'team', 'enterprise'],
  export_notion:      ['pro', 'team', 'enterprise'],
  templates:          ['pro', 'team', 'enterprise'],
  custom_vocabulary:  ['pro', 'team', 'enterprise'],
  timestamps:         ['pro', 'team', 'enterprise'],
  talk_time:          ['pro', 'team', 'enterprise'],
  email_digest:       ['pro', 'team', 'enterprise'],
  ai_chat:            ['pro', 'team', 'enterprise'],
  cloud_sync:         ['pro', 'team', 'enterprise'],
  team_workspace:     ['team', 'enterprise'],
  integrations_pm:    ['team', 'enterprise'],  // Jira, Asana, Monday
  admin_reports:      ['team', 'enterprise'],
  sso:                ['enterprise'],
};

export {
  PLANS,
  FEATURES,
  openCheckout,
  openCustomerPortal,
  getPlanLabel,
  isPlanFeatureEnabled,
};
