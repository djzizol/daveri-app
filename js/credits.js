import { getApiUrl } from "./api.js";
import { callRpcRecord, getCurrentUserId, hasSupabaseAccessToken } from "./supabaseClient.js";

const CREDITS_UPDATED_EVENT = "daveri:credits-updated";
const CREDITS_STATUS_ENDPOINT = getApiUrl("/api/credits/status");
const CREDITS_CONSUME_ENDPOINT = getApiUrl("/api/credits/consume");
const CREDITS_UPGRADE_ENDPOINT = getApiUrl("/api/credits/upgrade");

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const toNumberOrNull = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const ensureUserId = (userId = null) => {
  const resolved = (typeof userId === "string" && userId.trim() && userId.trim()) || getCurrentUserId();
  if (!resolved) {
    const error = new Error("Missing user id for credits RPC");
    error.code = "missing_user_id";
    console.error("[RPC:credits] missing user id", { code: error.code, message: error.message });
    throw error;
  }
  return resolved;
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

const isRpcAuthError = (error) => {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toUpperCase();
  return code === "P0001" || message.includes("NOT_AUTHENTICATED") || message.includes("JWT");
};

const requestWorkerJson = async (url, options = {}) => {
  const method = String(options.method || "GET").toUpperCase();
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
    const error = new Error(
      (isObject(payload) && (payload.error || payload.details)) || `Request failed: ${response.status}`
    );
    error.status = response.status;
    error.payload = payload;
    console.error("[Worker:credits]", {
      status: response.status,
      message: error.message,
      payload,
    });
    throw error;
  }

  return payload;
};

const emitCreditStatus = (status) => {
  if (!status || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CREDITS_UPDATED_EVENT, { detail: { status } }));
};

export const getCreditStatus = async (userId = null) => {
  const resolvedUserId = ensureUserId(userId);
  let status = null;
  const hasToken = await hasSupabaseAccessToken();

  if (hasToken) {
    try {
      const record = await callRpcRecord("get_credit_status", {
        p_user_id: resolvedUserId,
      });
      status = normalizeCreditStatus(record);
    } catch (error) {
      if (!isRpcAuthError(error)) throw error;
    }
  }

  if (!status) {
    const payload = await requestWorkerJson(CREDITS_STATUS_ENDPOINT, { method: "GET" });
    status = normalizeCreditStatus(payload?.status || payload);
  }

  if (status) emitCreditStatus(status);
  return status;
};

export const consumeMessageCredit = async (amount = 1, userId = null) => {
  const resolvedUserId = ensureUserId(userId);
  const safeAmount = Math.max(1, Math.floor(Number(amount) || 1));
  let status = null;
  let allowed = false;
  let raw = null;
  const hasToken = await hasSupabaseAccessToken();

  if (hasToken) {
    try {
      const record = await callRpcRecord("consume_message_credit", {
        p_user_id: resolvedUserId,
        p_amount: safeAmount,
      });
      status = normalizeCreditStatus(record);
      allowed = isObject(record) ? record.allowed === true : record === true;
      raw = record;
    } catch (error) {
      if (!isRpcAuthError(error)) throw error;
    }
  }

  if (!raw) {
    const payload = await requestWorkerJson(CREDITS_CONSUME_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        amount: safeAmount,
      }),
    });
    status = normalizeCreditStatus(payload?.status || payload);
    allowed = payload?.allowed === true;
    raw = payload;
  }

  if (status) emitCreditStatus(status);
  return {
    allowed,
    status,
    raw,
  };
};

export const applyPlanUpgrade = async (newPlanId = "premium", userId = null) => {
  const resolvedUserId = ensureUserId(userId);
  const planId = typeof newPlanId === "string" && newPlanId.trim() ? newPlanId.trim() : "premium";
  let status = null;
  let raw = null;
  const hasToken = await hasSupabaseAccessToken();

  if (hasToken) {
    try {
      raw = await callRpcRecord("apply_plan_change", {
        p_user_id: resolvedUserId,
        p_new_plan_id: planId,
        p_change_type: "upgrade",
      });
      status = await getCreditStatus(resolvedUserId);
    } catch (error) {
      if (!isRpcAuthError(error)) throw error;
    }
  }

  if (!raw) {
    const payload = await requestWorkerJson(CREDITS_UPGRADE_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        new_plan_id: planId,
        change_type: "upgrade",
      }),
    });
    status = normalizeCreditStatus(payload?.status || payload);
    raw = payload?.result ?? payload;
    if (status) emitCreditStatus(status);
  }

  return {
    status,
    raw,
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
