import { callRpcRecord } from "./supabaseClient.js";

const CREDIT_STATUS_RPC = "daveri_agent_credit_status";
const CACHE_TTL_MS = 45_000;

const listeners = new Set();

const state = {
  status: "idle",
  data: null,
  error: null,
  updatedAt: 0,
  inFlight: null,
};

const isFiniteNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric);
};

const toIntegerOrZero = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
};

const normalizeCreditStatus = (payload) => {
  if (!payload || typeof payload !== "object") return null;

  const usageDay =
    typeof payload.day === "string" && payload.day.trim()
      ? payload.day.trim()
      : new Date().toISOString().slice(0, 10);

  const monthStart =
    typeof payload.month === "string" && payload.month.trim()
      ? payload.month.trim()
      : `${usageDay.slice(0, 7)}-01`;

  return {
    day: usageDay,
    month: monthStart,
    daily_used: toIntegerOrZero(payload.daily_used),
    daily_cap: toIntegerOrZero(payload.daily_cap),
    monthly_used: toIntegerOrZero(payload.monthly_used),
    monthly_cap: toIntegerOrZero(payload.monthly_cap),
  };
};

const normalizeFromUsageResult = (payload) => {
  if (!payload || typeof payload !== "object") return null;
  if (
    !isFiniteNumber(payload.daily_used) ||
    !isFiniteNumber(payload.daily_cap) ||
    !isFiniteNumber(payload.monthly_used) ||
    !isFiniteNumber(payload.monthly_cap)
  ) {
    return null;
  }

  const usageDay =
    typeof payload.usage_day === "string" && payload.usage_day.trim()
      ? payload.usage_day.trim()
      : new Date().toISOString().slice(0, 10);

  return {
    day: usageDay,
    month: `${usageDay.slice(0, 7)}-01`,
    daily_used: toIntegerOrZero(payload.daily_used),
    daily_cap: toIntegerOrZero(payload.daily_cap),
    monthly_used: toIntegerOrZero(payload.monthly_used),
    monthly_cap: toIntegerOrZero(payload.monthly_cap),
  };
};

const emit = () => {
  const snapshot = getAgentCreditStatusSnapshot();
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {}
  });
};

export const getAgentCreditStatusSnapshot = () => ({
  status: state.status,
  data: state.data ? { ...state.data } : null,
  error: state.error || null,
  updatedAt: state.updatedAt,
});

export const subscribeAgentCreditStatus = (listener) => {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const refreshAgentCreditStatus = async ({ force = false } = {}) => {
  const now = Date.now();
  const cacheFresh = state.data && now - state.updatedAt < CACHE_TTL_MS;
  if (!force && cacheFresh) {
    return state.data;
  }

  if (state.inFlight) return state.inFlight;

  state.status = state.data ? "refreshing" : "loading";
  state.error = null;
  emit();

  state.inFlight = (async () => {
    try {
      const record = await callRpcRecord(CREDIT_STATUS_RPC);
      const normalized = normalizeCreditStatus(record);
      state.data = normalized;
      state.status = normalized ? "success" : "error";
      state.error = normalized ? null : new Error("No credit status data returned");
      state.updatedAt = Date.now();
      return normalized;
    } catch (error) {
      state.status = "error";
      state.error = error;
      throw error;
    } finally {
      state.inFlight = null;
      emit();
    }
  })();

  return state.inFlight;
};

export const applyAgentCreditUsageSnapshot = (payload) => {
  const normalized = normalizeFromUsageResult(payload);
  if (!normalized) return null;

  state.data = normalized;
  state.status = "success";
  state.error = null;
  state.updatedAt = Date.now();
  emit();
  return normalized;
};

