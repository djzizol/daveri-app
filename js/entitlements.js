import { callRpcRecord, getCurrentUserId } from "./supabaseClient.js";

const ENTITLEMENTS_UPDATED_EVENT = "daveri:entitlements-updated";

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
  const record = await callRpcRecord("get_entitlements_map", {
    p_user_id: resolvedUserId,
  });
  const entitlementsMap = normalizeEntitlementsMap(record);
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
