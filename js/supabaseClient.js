import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const DEFAULT_SUPABASE_URL = "https://inayqymryrriobowyysw.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_r3Lvhhf751_SNXg_rmCLQA_LJXv381f";

const resolveSupabaseConfig = () => {
  const fromWindow = window?.DaVeriSupabase || {};
  const url =
    (typeof fromWindow.url === "string" && fromWindow.url.trim()) || DEFAULT_SUPABASE_URL;
  const anonKey =
    (typeof fromWindow.anonKey === "string" && fromWindow.anonKey.trim()) || DEFAULT_SUPABASE_ANON_KEY;

  return {
    url: String(url).trim().replace(/\/+$/, ""),
    anonKey: String(anonKey).trim(),
  };
};

const { url: supabaseUrl, anonKey: supabaseAnonKey } = resolveSupabaseConfig();

const tokenPrefix = (token) => (typeof token === "string" ? token.slice(0, 12) : undefined);

const asRecord = (value) => (value && typeof value === "object" ? value : null);

const extractSupabaseSessionCandidate = (payload) => {
  const candidateSources = [];

  const root = asRecord(payload);
  if (root) {
    candidateSources.push(root);
    candidateSources.push(asRecord(root.supabase));
    candidateSources.push(asRecord(root.tokens));
    candidateSources.push(asRecord(root.supabase_tokens));
    candidateSources.push(asRecord(root.session));
    candidateSources.push(asRecord(root.supabase_session));
    candidateSources.push(asRecord(root.auth));
  }

  for (const source of candidateSources) {
    if (!source) continue;
    if (typeof source.access_token !== "string" || !source.access_token.trim()) continue;
    if (typeof source.refresh_token !== "string" || !source.refresh_token.trim()) continue;

    return {
      access_token: source.access_token.trim(),
      refresh_token: source.refresh_token.trim(),
    };
  }

  return null;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    headers: {
      "X-Client-Info": "daveri-web",
    },
  },
});

const syncSupabaseSessionFromPayload = async (payload, source) => {
  const candidate = extractSupabaseSessionCandidate(payload);
  if (!candidate) return false;

  try {
    const { data: current } = await supabase.auth.getSession();
    if (current?.session?.access_token === candidate.access_token) {
      return true;
    }

    const { error } = await supabase.auth.setSession(candidate);
    if (error) {
      console.warn("[SUPABASE AUTH SYNC]", {
        source,
        error: error.message,
      });
      return false;
    }

    console.info("[SUPABASE AUTH SYNC]", {
      source,
      access_token_prefix: tokenPrefix(candidate.access_token),
    });
    return true;
  } catch (error) {
    console.warn("[SUPABASE AUTH SYNC]", {
      source,
      error: error?.message || String(error),
    });
    return false;
  }
};

if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((event, session) => {
    console.group("[SUPABASE AUTH STATE]");
    console.log("event:", event);
    console.log("session exists:", Boolean(session));
    console.log("user id:", session?.user?.id);
    console.log("access_token prefix:", tokenPrefix(session?.access_token));
    console.groupEnd();
  });

  supabase.auth.getSession().then(({ data }) => {
    console.group("[SUPABASE AUTH INIT]");
    console.log("session exists:", Boolean(data?.session));
    console.log("user id:", data?.session?.user?.id);
    console.log("access_token prefix:", tokenPrefix(data?.session?.access_token));
    console.groupEnd();

    if (!data?.session && window?.DaVeriAuth) {
      void syncSupabaseSessionFromPayload(window.DaVeriAuth, "window.DaVeriAuth:init");
    }
  });

  if (window?.DaVeriAuth?.ready && typeof window.DaVeriAuth.ready.then === "function") {
    window.DaVeriAuth.ready
      .then((payload) => syncSupabaseSessionFromPayload(payload, "DaVeriAuth.ready"))
      .catch(() => {});
  }

  document.addEventListener("auth:ready", (event) => {
    void syncSupabaseSessionFromPayload(event?.detail, "auth:ready");
  });
}

export const getCurrentUserId = () => {
  const fromAuth = window?.DaVeriAuth?.user?.id;
  if (typeof fromAuth === "string" && fromAuth.trim()) return fromAuth.trim();

  const fromSidebar = document.getElementById("daveri_sidebar")?.dataset?.userId;
  if (typeof fromSidebar === "string" && fromSidebar.trim()) return fromSidebar.trim();

  return null;
};

export const logRpcError = (rpcName, error) => {
  const code = error?.code || "unknown";
  const message = error?.message || "RPC failed";
  console.error(`[RPC:${rpcName}]`, {
    code,
    message,
    details: error?.details || null,
    hint: error?.hint || null,
  });
};

export const normalizeRpcRecord = (payload) => {
  if (Array.isArray(payload)) return payload[0] || null;
  if (payload === null || payload === undefined) return null;
  return payload;
};

export const callRpc = async (rpcName, args = {}) => {
  const { data: sessionData } = await supabase.auth.getSession();
  console.group("[RPC DEBUG]");
  console.log("rpc:", rpcName);
  console.log("session exists:", Boolean(sessionData?.session));
  console.log("user id:", sessionData?.session?.user?.id);
  console.log("access_token prefix:", tokenPrefix(sessionData?.session?.access_token));
  console.groupEnd();

  const { data, error } = await supabase.rpc(rpcName, args);
  if (error) {
    logRpcError(rpcName, error);
    throw error;
  }
  return data;
};

export const callRpcRecord = async (rpcName, args = {}) => normalizeRpcRecord(await callRpc(rpcName, args));

export const hasSupabaseAccessToken = async () => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return false;
    return Boolean(data?.session?.access_token);
  } catch {
    return false;
  }
};

if (typeof window !== "undefined") {
  window.DaVeriSupabase = window.DaVeriSupabase || {};
  window.DaVeriSupabase.getCurrentUserId = getCurrentUserId;
}
