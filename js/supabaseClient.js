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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    headers: {
      "X-Client-Info": "daveri-web",
    },
  },
});

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
