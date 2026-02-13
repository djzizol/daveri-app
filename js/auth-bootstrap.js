import {
  getAuthSnapshot,
  getLoginUrl,
  initAuthStore,
  isLoginRoute,
  subscribeAuthState,
} from "./auth-store.js";

const AUTH_LOADER_ID = "daveri-auth-loader";
const LOGIN_REDIRECT_KEY = "daveri_login_redirect";

const createAuthLoader = () => {
  if (typeof document === "undefined") return null;
  if (document.getElementById(AUTH_LOADER_ID)) {
    return document.getElementById(AUTH_LOADER_ID);
  }

  const loader = document.createElement("div");
  loader.id = AUTH_LOADER_ID;
  loader.style.position = "fixed";
  loader.style.inset = "0";
  loader.style.zIndex = "2147483646";
  loader.style.display = "grid";
  loader.style.placeItems = "center";
  loader.style.background = "rgba(8, 10, 16, 0.78)";
  loader.style.backdropFilter = "blur(2px)";
  loader.style.color = "#e5e7eb";
  loader.style.fontFamily = "Inter, system-ui, -apple-system, Segoe UI, sans-serif";
  loader.style.fontSize = "14px";
  loader.style.letterSpacing = "0.02em";
  loader.textContent = "Checking session...";
  document.body.appendChild(loader);
  return loader;
};

const hideNode = (node) => {
  if (!node) return;
  node.hidden = true;
  node.style.display = "none";
};

const showNode = (node, display = "") => {
  if (!node) return;
  node.hidden = false;
  node.style.display = display;
};

const resolveWindowAuthObject = (readyPromise) => {
  window.DaVeriAuth = window.DaVeriAuth || {};
  window.DaVeriAuth.ready = readyPromise;
  window.DaVeriAuth.getSnapshot = getAuthSnapshot;
  window.DaVeriAuth.session = null;
  window.DaVeriAuth.user = null;
  window.DaVeriAuth.isAuthReady = false;
  return window.DaVeriAuth;
};

const applyAuthScreenState = (snapshot) => {
  const authScreen = document.getElementById("auth-screen");
  const pageWrapper = document.getElementById("page-wrapper");
  if (!authScreen && !pageWrapper) return;

  if (!snapshot?.isAuthReady) {
    if (authScreen) showNode(authScreen, "");
    if (pageWrapper) hideNode(pageWrapper);
    return;
  }

  if (snapshot?.session?.user) {
    if (authScreen) hideNode(authScreen);
    if (pageWrapper) showNode(pageWrapper, "flex");
    return;
  }

  if (authScreen) showNode(authScreen, "");
  if (pageWrapper) hideNode(pageWrapper);
};

const redirectToLogin = () => {
  try {
    localStorage.setItem(LOGIN_REDIRECT_KEY, window.location.href);
  } catch {}
  window.location.href = getLoginUrl();
};

const bootAuth = () => {
  const loginPage = isLoginRoute();
  const hasAuthScreen = Boolean(document.getElementById("auth-screen"));
  const requiresAuth = !loginPage;
  const loader = requiresAuth && !hasAuthScreen ? createAuthLoader() : null;

  let readySettled = false;
  let resolveReady;
  let rejectReady;

  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  ready.catch(() => {});

  const authObject = resolveWindowAuthObject(ready);

  const syncAuthObject = (snapshot) => {
    authObject.session = snapshot?.session || null;
    authObject.user = snapshot?.session?.user || null;
    authObject.isAuthReady = snapshot?.isAuthReady === true;
    applyAuthScreenState(snapshot);
  };

  const handleSnapshot = (snapshot) => {
    syncAuthObject(snapshot);

    if (!snapshot?.isAuthReady) {
      return;
    }

    if (loader) {
      loader.remove();
    }

    if (snapshot?.session?.user) {
      document.dispatchEvent(new CustomEvent("auth:ready", { detail: snapshot }));
      if (!readySettled) {
        readySettled = true;
        resolveReady(snapshot);
      }
      return;
    }

    const authError = snapshot?.error || new Error("Not authenticated");
    document.dispatchEvent(
      new CustomEvent("auth:failed", {
        detail: {
          error: authError,
          state: snapshot,
        },
      })
    );

    if (!readySettled) {
      readySettled = true;
      rejectReady(authError);
    }

    if (requiresAuth) {
      redirectToLogin();
    }
  };

  subscribeAuthState(handleSnapshot);
  handleSnapshot(getAuthSnapshot());
  void initAuthStore().then((snapshot) => handleSnapshot(snapshot));
};

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootAuth, { once: true });
  } else {
    bootAuth();
  }
}
