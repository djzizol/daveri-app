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
  });
}

export const getCurrentUserId = () => {
  const fromAuth = window?.DaVeriAuth?.user?.id;
  if (typeof fromAuth === "string" && fromAuth.trim()) return fromAuth.trim();

  const fromAuthStore = window?.DaVeriAuthStore?.getSnapshot?.()?.session?.user?.id;
  if (typeof fromAuthStore === "string" && fromAuthStore.trim()) return fromAuthStore.trim();

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
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  console.group("[RPC DEBUG]");
  console.log("rpc:", rpcName);
  console.log("session exists:", Boolean(sessionData?.session));
  console.log("user id:", sessionData?.session?.user?.id);
  console.log("access_token prefix:", tokenPrefix(sessionData?.session?.access_token));
  console.groupEnd();

  if (sessionError || !sessionData?.session?.access_token) {
    const authError = new Error("No Supabase session");
    authError.code = "auth_required";
    console.warn("[RPC BLOCKED]", {
      rpc: rpcName,
      reason: sessionError?.message || authError.message,
    });
    throw authError;
  }

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
