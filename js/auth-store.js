import { supabase } from "./supabaseClient.js";

const AUTH_STATE_EVENT = "daveri:auth-state-updated";
const SUPPORTED_LANGS = new Set(["en", "pl", "de", "fr", "es", "pt"]);

const authState = {
  session: null,
  user: null,
  isAuthReady: false,
  error: null,
  source: "boot",
};

let initPromise = null;
let authSubscription = null;
let ensureUserPromise = null;
let ensureUserForId = null;
const listeners = new Set();

const tokenPrefix = (token) => (typeof token === "string" ? token.slice(0, 12) : undefined);

const toError = (value) => {
  if (value instanceof Error) return value;
  return new Error(typeof value === "string" ? value : "Unknown auth error");
};

const cloneState = () => ({
  session: authState.session,
  user: authState.user,
  isAuthReady: authState.isAuthReady === true,
  error: authState.error,
  source: authState.source,
});

const emitState = () => {
  if (typeof window === "undefined") return;
  const snapshot = cloneState();

  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {}
  });

  window.dispatchEvent(
    new CustomEvent(AUTH_STATE_EVENT, {
      detail: { state: snapshot },
    })
  );
};

const setState = (patch) => {
  Object.assign(authState, patch || {});
  emitState();
};

const getLanguageFromPath = () => {
  if (typeof window === "undefined") return "en";
  const segments = window.location.pathname.split("/").filter(Boolean);
  const candidate = segments[0];
  if (SUPPORTED_LANGS.has(candidate)) {
    return candidate;
  }
  return "en";
};

const buildLocalizedUrl = (pathname) => {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const languageApi = window?.DaVeriLanguage;
  const currentLanguage = languageApi?.getCurrentLanguage?.() || getLanguageFromPath();
  if (languageApi?.buildLanguageUrl) {
    return languageApi.buildLanguageUrl(currentLanguage, { pathname: normalizedPath });
  }
  return `/${currentLanguage}${normalizedPath}`;
};

const stripLanguagePrefix = (pathname = "/") => {
  const segments = String(pathname || "/").split("/").filter(Boolean);
  if (segments[0] && SUPPORTED_LANGS.has(segments[0])) {
    segments.shift();
  }
  return segments.length ? `/${segments.join("/")}` : "/";
};

export const isLoginRoute = (pathname = window?.location?.pathname || "/") => {
  const clean = stripLanguagePrefix(pathname).replace(/\/+$/, "") || "/";
  return clean === "/login";
};

export const getLoginUrl = () => buildLocalizedUrl("/login/");
export const getDashboardUrl = () => buildLocalizedUrl("/dashboard/");

export const getAuthSnapshot = () => cloneState();

export const subscribeAuthState = (listener) => {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const waitForAuthReady = async () => {
  if (authState.isAuthReady) {
    return cloneState();
  }

  return new Promise((resolve) => {
    const unsubscribe = subscribeAuthState((snapshot) => {
      if (!snapshot.isAuthReady) return;
      unsubscribe();
      resolve(snapshot);
    });
  });
};

const ensureUserRow = async (session) => {
  const userId = session?.user?.id;
  if (typeof userId !== "string" || !userId.trim()) return;

  if (ensureUserPromise && ensureUserForId === userId) {
    await ensureUserPromise;
    return;
  }

  ensureUserForId = userId;
  ensureUserPromise = (async () => {
    const { data, error } = await supabase.rpc("daveri_ensure_user_row");
    if (error) {
      throw error;
    }
    return data;
  })();

  try {
    await ensureUserPromise;
  } catch (rpcError) {
    const email = session?.user?.email || null;
    if (email) {
      const { error: upsertError } = await supabase.from("users").upsert(
        {
          id: userId,
          email,
          plan_id: "free",
        },
        { onConflict: "id" }
      );

      if (!upsertError) {
        console.info("[AUTH] ensured user row via direct upsert fallback");
        return;
      }
    }

    throw rpcError;
  } finally {
    ensureUserPromise = null;
    ensureUserForId = null;
  }
};

const applySession = async (session, source) => {
  if (session?.user) {
    try {
      await ensureUserRow(session);
    } catch (error) {
      console.error("[AUTH] ensure user row failed", {
        code: error?.code || null,
        message: error?.message || String(error),
      });
    }

    setState({
      session,
      user: session.user,
      isAuthReady: true,
      error: null,
      source,
    });
    return;
  }

  setState({
    session: null,
    user: null,
    isAuthReady: true,
    error: null,
    source,
  });
};

export const initAuthStore = async () => {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    setState({
      isAuthReady: false,
      error: null,
      source: "init:loading",
    });

    const { data, error } = await supabase.auth.getSession();
    if (error) {
      const normalized = toError(error.message || error);
      setState({
        session: null,
        user: null,
        isAuthReady: true,
        error: normalized,
        source: "init:error",
      });
    } else {
      await applySession(data?.session || null, "init:getSession");
    }

    if (!authSubscription) {
      const { data: subscriptionData } = supabase.auth.onAuthStateChange((event, session) => {
        console.group("[AUTH STORE]");
        console.log("event:", event);
        console.log("session exists:", Boolean(session));
        console.log("user id:", session?.user?.id);
        console.log("access_token prefix:", tokenPrefix(session?.access_token));
        console.groupEnd();
        void applySession(session || null, `event:${event}`);
      });
      authSubscription = subscriptionData?.subscription || null;
    }

    return cloneState();
  })().catch((error) => {
    const normalized = toError(error);
    setState({
      session: null,
      user: null,
      isAuthReady: true,
      error: normalized,
      source: "init:exception",
    });
    return cloneState();
  });

  return initPromise;
};

if (typeof window !== "undefined") {
  window.DaVeriAuthStore = {
    init: initAuthStore,
    getSnapshot: getAuthSnapshot,
    subscribe: subscribeAuthState,
    waitForReady: waitForAuthReady,
    isLoginRoute,
    getLoginUrl,
    getDashboardUrl,
  };
}

