import { getApiUrl } from "./api.js";

const ENTITLEMENTS_ENDPOINT = getApiUrl("/api/entitlements");
const ENTITLEMENTS_UPDATED_EVENT = "daveri:entitlements-updated";

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);

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

const normalizeEntitlementsMap = (payload) => {
  const source =
    (isObject(payload?.entitlements_map) && payload.entitlements_map) ||
    (isObject(payload?.entitlements) && payload.entitlements) ||
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

export const getEntitlementsMap = async () => {
  const payload = await requestJson(ENTITLEMENTS_ENDPOINT, { method: "GET" });
  const entitlementsMap = normalizeEntitlementsMap(payload);
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
