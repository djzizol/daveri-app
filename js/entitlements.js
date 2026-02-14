import { apiFetch, getApiUrl } from "./api.js";
import { callRpcRecord, getCurrentUserId, hasSupabaseAccessToken } from "./supabaseClient.js";

const ENTITLEMENTS_UPDATED_EVENT = "daveri:entitlements-updated";
const ENTITLEMENTS_ENDPOINT = getApiUrl("/api/entitlements");

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const ensureUserId = (userId = null) => {
  const resolved = (typeof userId === "string" && userId.trim() && userId.trim()) || getCurrentUserId();
  if (!resolved) {
    const error = new Error("Missing user id for entitlements RPC");
    error.code = "missing_user_id";
    console.error("[RPC:entitlements] missing user id", { code: error.code, message: error.message });
    throw error;
  }
  return resolved;
};

const normalizeEntitlementsMap = (payload) => {
  const source =
    (isObject(payload?.entitlements_map) && payload.entitlements_map) ||
    (isObject(payload?.entitlements) && payload.entitlements) ||
    (isObject(payload?.map) && payload.map) ||
    (isObject(payload) && payload) ||
    {};

  const normalized = {};
  Object.entries(source).forEach(([feature, rawValue]) => {
    if (rawValue === true || rawValue === false) {
      normalized[feature] = { enabled: rawValue === true };
      return;
    }
    if (!isObject(rawValue)) {
      normalized[feature] = { enabled: false };
      return;
    }

    normalized[feature] = {
      ...rawValue,
      enabled: rawValue.enabled === true,
      required_plan:
        typeof rawValue.required_plan === "string" && rawValue.required_plan.trim()
          ? rawValue.required_plan.trim()
          : null,
      meta: isObject(rawValue.meta) ? rawValue.meta : null,
    };
  });

  return normalized;
};

const isRpcAuthError = (error) => {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toUpperCase();
  return code === "P0001" || message.includes("NOT_AUTHENTICATED") || message.includes("JWT");
};

const isMissingUsersRowError = (error) => {
  const code = String(error?.code || "").toUpperCase();
  const details = String(error?.details || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "23503" &&
    (details.includes("is not present in table \"users\"") ||
      message.includes("violates foreign key constraint"))
  );
};

const ensureAuthUserRow = async () => {
  try {
    await callRpcRecord("daveri_ensure_user_row");
    return true;
  } catch (error) {
    console.error("[RPC:entitlements] ensure user row failed", {
      code: error?.code || null,
      message: error?.message || String(error),
    });
    return false;
  }
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

  const response = await apiFetch(url, {
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
    console.error("[Worker:entitlements]", {
      status: response.status,
      message: error.message,
      payload,
    });
    throw error;
  }

  return payload;
};

const emitEntitlementsMap = (entitlementsMap) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(ENTITLEMENTS_UPDATED_EVENT, {
      detail: { entitlements_map: entitlementsMap },
    })
  );
};

export const getEntitlementsMap = async (userId = null) => {
  const resolvedUserId = ensureUserId(userId);
  let entitlementsMap = null;
  const hasToken = await hasSupabaseAccessToken();

  if (hasToken) {
    try {
      const record = await callRpcRecord("get_entitlements_map", {
        p_user_id: resolvedUserId,
      });
      entitlementsMap = normalizeEntitlementsMap(record);
    } catch (error) {
      if (isMissingUsersRowError(error)) {
        const ensured = await ensureAuthUserRow();
        if (ensured) {
          const retryRecord = await callRpcRecord("get_entitlements_map", {
            p_user_id: resolvedUserId,
          });
          entitlementsMap = normalizeEntitlementsMap(retryRecord);
        } else if (!isRpcAuthError(error)) {
          throw error;
        }
        if (entitlementsMap) {
          emitEntitlementsMap(entitlementsMap);
          return entitlementsMap;
        }
      }
      if (!isRpcAuthError(error)) throw error;
    }
  }

  if (!entitlementsMap) {
    const payload = await requestWorkerJson(ENTITLEMENTS_ENDPOINT, { method: "GET" });
    entitlementsMap = normalizeEntitlementsMap(payload?.entitlements_map || payload);
  }

  emitEntitlementsMap(entitlementsMap);
  return entitlementsMap;
};

export const subscribeEntitlementsUpdates = (listener) => {
  if (typeof window === "undefined" || typeof listener !== "function") {
    return () => {};
  }

  const handler = (event) => {
    listener(event?.detail?.entitlements_map || {}, event);
  };

  window.addEventListener(ENTITLEMENTS_UPDATED_EVENT, handler);
  return () => window.removeEventListener(ENTITLEMENTS_UPDATED_EVENT, handler);
};

if (typeof window !== "undefined") {
  window.DaVeriEntitlements = {
    getEntitlementsMap,
    subscribeEntitlementsUpdates,
  };
}
