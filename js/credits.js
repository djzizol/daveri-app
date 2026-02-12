import { getApiUrl } from "./api.js";

const CREDITS_STATUS_ENDPOINT = getApiUrl("/api/credits/status");
const CREDITS_CONSUME_ENDPOINT = getApiUrl("/api/credits/consume");
const CREDITS_UPGRADE_ENDPOINT = getApiUrl("/api/credits/upgrade");
const CREDITS_UPDATED_EVENT = "daveri:credits-updated";

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);
const getCurrentUserId = () =>
  (typeof window !== "undefined" && (window?.DaVeriAuth?.user?.id || null)) || null;

const toNumberOrNull = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeCreditStatus = (payload) => {
  const source = isObject(payload?.status) ? payload.status : payload;
  if (!isObject(source)) return null;

  return {
    plan_id: typeof source.plan_id === "string" && source.plan_id.trim() ? source.plan_id.trim() : null,
    monthly_limit: toNumberOrNull(source.monthly_limit),
    monthly_balance: toNumberOrNull(source.monthly_balance),
    daily_cap: toNumberOrNull(source.daily_cap),
    daily_balance: toNumberOrNull(source.daily_balance),
    remaining: toNumberOrNull(source.remaining),
    capacity: toNumberOrNull(source.capacity),
    next_daily_reset: typeof source.next_daily_reset === "string" ? source.next_daily_reset : null,
    next_monthly_reset: typeof source.next_monthly_reset === "string" ? source.next_monthly_reset : null,
  };
};

const requestJson = async (url, options = {}) => {
  const method = (options.method || "GET").toUpperCase();
  const headers = {
    Accept: "application/json",
    ...(options.headers || {}),
  };
  if (method !== "GET" && method !== "HEAD" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    credentials: "include",
    ...options,
    method,
    headers,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      (isObject(payload) && (payload.error || payload.details)) ||
      `Request failed: ${response.status}`;
    const error = new Error(String(message));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

const emitCreditStatus = (status) => {
  if (!status || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CREDITS_UPDATED_EVENT, { detail: { status } }));
};

export const getCreditStatus = async () => {
  const payload = await requestJson(CREDITS_STATUS_ENDPOINT, { method: "GET" });
  const status = normalizeCreditStatus(payload?.status || payload);
  if (status) emitCreditStatus(status);
  return status;
};

export const consumeMessageCredit = async (amount = 1) => {
  const safeAmount = Math.max(1, Math.floor(Number(amount) || 1));
  const payload = await requestJson(CREDITS_CONSUME_ENDPOINT, {
    method: "POST",
    body: JSON.stringify({
      amount: safeAmount,
      user_id: getCurrentUserId(),
    }),
  });

  const status = normalizeCreditStatus(payload?.status || payload);
  if (status) emitCreditStatus(status);

  const allowed = payload?.allowed === true;
  return {
    allowed,
    status,
    raw: payload,
  };
};

export const applyPlanUpgrade = async (newPlanId = "premium") => {
  const planId = typeof newPlanId === "string" && newPlanId.trim() ? newPlanId.trim() : "premium";
  const payload = await requestJson(CREDITS_UPGRADE_ENDPOINT, {
    method: "POST",
    body: JSON.stringify({
      new_plan_id: planId,
      change_type: "upgrade",
      user_id: getCurrentUserId(),
    }),
  });

  const status = normalizeCreditStatus(payload?.status || payload);
  if (status) emitCreditStatus(status);

  return {
    status,
    raw: payload,
  };
};

export const subscribeCreditUpdates = (listener) => {
  if (typeof window === "undefined" || typeof listener !== "function") {
    return () => {};
  }

  const handler = (event) => {
    listener(event?.detail?.status || null, event);
  };

  window.addEventListener(CREDITS_UPDATED_EVENT, handler);
  return () => window.removeEventListener(CREDITS_UPDATED_EVENT, handler);
};

if (typeof window !== "undefined") {
  window.DaVeriCredits = {
    getCreditStatus,
    consumeMessageCredit,
    applyPlanUpgrade,
    subscribeCreditUpdates,
  };
}
