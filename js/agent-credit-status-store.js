import { callRpcRecord, supabase } from "./supabaseClient.js";

const CREDIT_STATUS_RPC = "daveri_agent_credit_status";
const CACHE_TTL_MS = 45_000;

const listeners = new Set();

const state = {
  day: null,
  daily_used: null,
  daily_cap: null,
  month: null,
  monthly_used: null,
  monthly_cap: null,
  isLoading: false,
  error: null,
  lastFetchedAt: 0,
  inFlight: null,
};

const toIntegerOrZero = (value, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.floor(numeric));
};

const toCapOrUnlimited = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric <= 0) return null;
  return Math.floor(numeric);
};

const hasLoadedCredits = () =>
  typeof state.day === "string" ||
  Number.isFinite(state.daily_used) ||
  Number.isFinite(state.monthly_used) ||
  state.daily_cap !== null ||
  state.monthly_cap !== null;

const creditDataFromState = () => {
  if (!hasLoadedCredits()) return null;
  return {
    day: typeof state.day === "string" ? state.day : new Date().toISOString().slice(0, 10),
    daily_used: toIntegerOrZero(state.daily_used, 0),
    daily_cap: state.daily_cap === null ? null : toCapOrUnlimited(state.daily_cap),
    month: typeof state.month === "string" ? state.month : `${new Date().toISOString().slice(0, 7)}-01`,
    monthly_used: toIntegerOrZero(state.monthly_used, 0),
    monthly_cap: state.monthly_cap === null ? null : toCapOrUnlimited(state.monthly_cap),
  };
};

const setLoadedState = (payload) => {
  state.day = payload.day;
  state.daily_used = payload.daily_used;
  state.daily_cap = payload.daily_cap;
  state.month = payload.month;
  state.monthly_used = payload.monthly_used;
  state.monthly_cap = payload.monthly_cap;
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
    daily_cap: toCapOrUnlimited(payload.daily_cap),
    monthly_used: toIntegerOrZero(payload.monthly_used),
    monthly_cap: toCapOrUnlimited(payload.monthly_cap),
  };
};

const normalizeFromUsageResult = (payload) => {
  if (!payload || typeof payload !== "object") return null;
  const dailyUsed = Number(payload.daily_used);
  const monthlyUsed = Number(payload.monthly_used);
  if (!Number.isFinite(dailyUsed) || !Number.isFinite(monthlyUsed)) {
    return null;
  }

  const usageDay =
    typeof payload.usage_day === "string" && payload.usage_day.trim()
      ? payload.usage_day.trim()
      : new Date().toISOString().slice(0, 10);

  return {
    day: usageDay,
    month: `${usageDay.slice(0, 7)}-01`,
    daily_used: toIntegerOrZero(dailyUsed),
    daily_cap: toCapOrUnlimited(payload.daily_cap),
    monthly_used: toIntegerOrZero(monthlyUsed),
    monthly_cap: toCapOrUnlimited(payload.monthly_cap),
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
  day: state.day,
  daily_used: state.daily_used,
  daily_cap: state.daily_cap,
  month: state.month,
  monthly_used: state.monthly_used,
  monthly_cap: state.monthly_cap,
  isLoading: state.isLoading,
  error: state.error || null,
  lastFetchedAt: state.lastFetchedAt,
});

export const subscribeAgentCreditStatus = (listener) => {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const refreshAgentCreditStatus = async ({ force = false } = {}) => {
  const now = Date.now();
  const cacheFresh = hasLoadedCredits() && now - state.lastFetchedAt < CACHE_TTL_MS;
  if (!force && cacheFresh) {
    return creditDataFromState();
  }

  if (state.inFlight) return state.inFlight;

  state.isLoading = true;
  state.error = null;
  emit();

  state.inFlight = (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();

      console.group("[RPC DEBUG]");
      console.log("rpc:", CREDIT_STATUS_RPC);
      console.log("session exists:", Boolean(sessionData?.session));
      console.log("user id:", sessionData?.session?.user?.id);
      console.log(
        "access_token prefix:",
        typeof sessionData?.session?.access_token === "string"
          ? sessionData.session.access_token.slice(0, 12)
          : undefined
      );
      console.groupEnd();

      if (!sessionData?.session?.access_token) {
        const authError = new Error("Zaloguj sie ponownie");
        authError.code = "auth_required";
        state.day = null;
        state.daily_used = null;
        state.daily_cap = null;
        state.month = null;
        state.monthly_used = null;
        state.monthly_cap = null;
        state.isLoading = false;
        state.error = authError;
        state.lastFetchedAt = Date.now();
        console.warn("[RPC BLOCKED] No Supabase session");
        emit();
        return null;
      }

      const record = await callRpcRecord(CREDIT_STATUS_RPC);
      const normalized = normalizeCreditStatus(record);
      if (!normalized) {
        throw new Error("No credit status data returned");
      }
      setLoadedState(normalized);
      state.isLoading = false;
      state.error = null;
      state.lastFetchedAt = Date.now();
      emit();
      return normalized;
    } catch (error) {
      state.isLoading = false;
      state.error = error;
      state.lastFetchedAt = Date.now();
      emit();
      throw error;
    } finally {
      state.inFlight = null;
    }
  })();

  return state.inFlight;
};

export const applyAgentCreditUsageSnapshot = (payload) => {
  const normalized = normalizeFromUsageResult(payload);
  if (!normalized) return null;

  setLoadedState(normalized);
  state.isLoading = false;
  state.error = null;
  state.lastFetchedAt = Date.now();
  emit();
  return normalized;
};
