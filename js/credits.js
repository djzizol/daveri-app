import { callRpcRecord, getCurrentUserId } from "./supabaseClient.js";

const CREDITS_UPDATED_EVENT = "daveri:credits-updated";

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

const emitCreditStatus = (status) => {
  if (!status || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CREDITS_UPDATED_EVENT, { detail: { status } }));
};

export const getCreditStatus = async (userId = null) => {
  const resolvedUserId = ensureUserId(userId);
  const record = await callRpcRecord("get_credit_status", {
    p_user_id: resolvedUserId,
  });
  const status = normalizeCreditStatus(record);
  if (status) emitCreditStatus(status);
  return status;
};

export const consumeMessageCredit = async (amount = 1, userId = null) => {
  const resolvedUserId = ensureUserId(userId);
  const safeAmount = Math.max(1, Math.floor(Number(amount) || 1));

  const record = await callRpcRecord("consume_message_credit", {
    p_user_id: resolvedUserId,
    p_amount: safeAmount,
  });

  const status = normalizeCreditStatus(record);
  if (status) emitCreditStatus(status);

  const allowed = isObject(record) ? record.allowed === true : record === true;
  return {
    allowed,
    status,
    raw: record,
  };
};

export const applyPlanUpgrade = async (newPlanId = "premium", userId = null) => {
  const resolvedUserId = ensureUserId(userId);
  const planId = typeof newPlanId === "string" && newPlanId.trim() ? newPlanId.trim() : "premium";

  const result = await callRpcRecord("apply_plan_change", {
    p_user_id: resolvedUserId,
    p_new_plan_id: planId,
    p_change_type: "upgrade",
  });

  const status = await getCreditStatus(resolvedUserId);
  return {
    status,
    raw: result,
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
