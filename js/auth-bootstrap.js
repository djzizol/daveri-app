const AUTH_ENDPOINT = "https://api.daveri.io/auth/me";

const getLanguageApi = () => window?.DaVeriLanguage;

const getLanguageFromPath = () => {
  if (typeof window === "undefined") return "en";
  const segments = window.location.pathname.split("/").filter(Boolean);
  const candidate = segments[0];
  if (["en", "pl", "de", "fr", "es", "pt"].includes(candidate)) {
    return candidate;
  }
  return "en";
};

const getLoginUrl = () => {
  const langApi = getLanguageApi();
  if (langApi?.buildLanguageUrl) {
    return langApi.buildLanguageUrl(langApi.getCurrentLanguage?.() || getLanguageFromPath(), { pathname: "/login/" });
  }
  return `/${getLanguageFromPath()}/login/`;
};

const ensureAuthReady = () => {
  if (typeof window === "undefined") {
    return Promise.resolve({ logged: false });
  }

  if (window.DaVeriAuth?.ready) {
    return window.DaVeriAuth.ready;
  }

  const ready = (async () => {
    const response = await fetch(AUTH_ENDPOINT, { credentials: "include" });
    if (!response.ok) {
      throw new Error("Not authenticated");
    }
    const data = await response.json();
    if (!data?.logged) {
      throw new Error("Not authenticated");
    }
    return data;
  })();

  window.DaVeriAuth = { ready };

  ready
    .then((data) => {
      window.DaVeriAuth.user = data.user;
      document.dispatchEvent(new CustomEvent("auth:ready", { detail: data }));
    })
    .catch((error) => {
      document.dispatchEvent(new CustomEvent("auth:failed", { detail: { error } }));
      const authScreen = document.getElementById("auth-screen");
      if (!authScreen) {
        window.location.href = getLoginUrl();
      }
    });

  return ready;
};

ensureAuthReady();
