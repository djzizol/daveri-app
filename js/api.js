import { getLoginUrl } from "./auth-store.js";
import { supabase } from "./supabaseClient.js";

const resolveApiOrigin = () => {
  if (typeof window === "undefined") {
    return "https://api.daveri.io";
  }

  if (typeof window.DaVeriApiOrigin === "string" && window.DaVeriApiOrigin.trim()) {
    return window.DaVeriApiOrigin.trim().replace(/\/$/, "");
  }

  const host = window.location.hostname.toLowerCase();
  if (host === "api.daveri.io") return "";
  if (host === "daveri.io" || host.endsWith(".daveri.io")) return "https://api.daveri.io";
  return "https://api.daveri.io";
};

export const getApiUrl = (path = "") => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const origin = resolveApiOrigin();
  return origin ? `${origin}${normalizedPath}` : normalizedPath;
};

const hasHeader = (headers, name) => {
  const target = String(name || "").trim().toLowerCase();
  return Object.keys(headers || {}).some((key) => String(key || "").trim().toLowerCase() === target);
};

const createAuthRequiredError = (message = "Authentication required") => {
  const error = new Error(message);
  error.code = "auth_required";
  return error;
};

const redirectToLogin = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("daveri_login_redirect", window.location.href);
  } catch {}
  window.location.href = getLoginUrl();
};

export const getAccessToken = async (options = {}) => {
  const redirectOnAuthError = options?.redirectOnAuthError === true;
  let sessionData = null;
  let sessionError = null;

  try {
    const { data, error } = await supabase.auth.getSession();
    sessionData = data;
    sessionError = error || null;
  } catch (error) {
    sessionError = error;
  }

  const accessToken = sessionData?.session?.access_token;
  if (sessionError || !accessToken) {
    if (redirectOnAuthError) {
      redirectToLogin();
    }
    throw createAuthRequiredError(sessionError?.message || "Missing Supabase session");
  }

  return accessToken;
};

export const apiFetch = async (path, options = {}) => {
  const method = String(options?.method || "GET").toUpperCase();
  const headers = { ...(options?.headers || {}) };
  const requireAuth = options?.requireAuth !== false;
  const redirectOnAuthError = options?.redirectOnAuthError !== false;
  const { headers: _ignoredHeaders, credentials: _ignoredCredentials, ...restOptions } = options || {};

  if (requireAuth && !hasHeader(headers, "Authorization")) {
    const accessToken = await getAccessToken({ redirectOnAuthError });
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const target =
    typeof path === "string" && path && (path.startsWith("http://") || path.startsWith("https://"))
      ? path
      : getApiUrl(typeof path === "string" ? path : "");

  return fetch(target, {
    ...restOptions,
    method,
    headers,
    credentials: "omit",
  });
};

export const apiFetchJson = async (path, options = {}) => {
  const method = String(options?.method || "GET").toUpperCase();
  const headers = {
    Accept: "application/json",
    ...(options?.headers || {}),
  };
  if (method !== "GET" && method !== "HEAD" && !hasHeader(headers, "Content-Type")) {
    headers["Content-Type"] = "application/json";
  }

  const response = await apiFetch(path, {
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
      payload?.error || payload?.details || payload?.message || `Request failed: ${response.status}`
    );
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};
