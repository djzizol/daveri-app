const SUPPORTED_LANGS = ["en", "pl", "de", "fr", "es", "pt"];
const COOKIE_NAME = "lang";
let currentLanguage = "";

const normalizeLang = (value) => {
  if (!value) return "";
  const lower = value.toLowerCase();
  const base = lower.split("-")[0];
  return SUPPORTED_LANGS.includes(base) ? base : "";
};

const getCookie = (name) => {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
};

const setCookie = (name, value) => {
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
};

const detectBrowserLang = () => normalizeLang(navigator.language);

const getPathLanguageInfo = (pathname = "") => {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return { language: "", restPath: "/", invalid: false };
  }
  const first = segments[0];
  const restSegments = segments.slice(1);
  if (SUPPORTED_LANGS.includes(first)) {
    return { language: first, restPath: `/${restSegments.join("/")}`, invalid: false };
  }
  if (first.length === 2) {
    return { language: "", restPath: `/${restSegments.join("/")}`, invalid: true };
  }
  return { language: "", restPath: pathname, invalid: false };
};

const normalizeRestPath = (path) => {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
};

const setDocumentLanguage = (lang) => {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang;
};

const buildLanguageUrl = (lang, options = {}) => {
  const normalized = normalizeLang(lang) || "en";
  const pathname = options.pathname ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  const info = getPathLanguageInfo(pathname);
  const restPath = normalizeRestPath(info.language || info.invalid ? info.restPath : pathname);
  const basePath = restPath === "/" ? `/${normalized}/` : `/${normalized}${restPath}`;
  const search = options.search ?? (typeof window !== "undefined" ? window.location.search : "");
  const hash = options.hash ?? (typeof window !== "undefined" ? window.location.hash : "");
  return `${basePath}${search}${hash}`;
};

const resolveInitialLanguage = () => {
  const fromCookie = normalizeLang(getCookie(COOKIE_NAME));
  if (fromCookie) return fromCookie;
  const fromBrowser = detectBrowserLang();
  if (fromBrowser) return fromBrowser;
  return "en";
};

export const getCurrentLanguage = () => {
  if (!currentLanguage) {
    if (typeof window !== "undefined") {
      const info = getPathLanguageInfo(window.location.pathname);
      if (info.language) {
        currentLanguage = info.language;
      } else {
        currentLanguage = resolveInitialLanguage();
      }
    } else {
      currentLanguage = resolveInitialLanguage();
    }
    setCookie(COOKIE_NAME, currentLanguage);
    setDocumentLanguage(currentLanguage);
  }
  return currentLanguage;
};

export const setCurrentLanguage = (lang, options = {}) => {
  const normalized = normalizeLang(lang) || "en";
  currentLanguage = normalized;
  setCookie(COOKIE_NAME, normalized);
  setDocumentLanguage(normalized);
  if (options.updateUrl !== false && typeof window !== "undefined") {
    const targetUrl = buildLanguageUrl(normalized, {
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
    });
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (targetUrl !== currentUrl) {
      if (options.replaceState) {
        window.history.replaceState({}, "", targetUrl);
      } else {
        window.history.pushState({}, "", targetUrl);
      }
    }
  }
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent("language:changed", { detail: { language: normalized } }));
  }
  return normalized;
};

export const ensureLanguagePrefix = () => {
  if (typeof window === "undefined") {
    return { redirected: false, language: "en" };
  }
  const info = getPathLanguageInfo(window.location.pathname);
  if (info.language) {
    setCookie(COOKIE_NAME, info.language);
    setDocumentLanguage(info.language);
    return { redirected: false, language: info.language };
  }
  const fallback = info.invalid ? "en" : resolveInitialLanguage();
  const targetUrl = buildLanguageUrl(fallback, {
    pathname: info.restPath,
    search: window.location.search,
    hash: window.location.hash,
  });
  window.location.replace(targetUrl);
  return { redirected: true, language: fallback };
};

export const getSupportedLanguages = () => [...SUPPORTED_LANGS];

export const normalizeLanguage = normalizeLang;

export const getLanguageFromPath = (pathname) => getPathLanguageInfo(pathname).language;

if (typeof window !== "undefined") {
  window.DaVeriLanguage = {
    getCurrentLanguage,
    setCurrentLanguage,
    getSupportedLanguages,
    getLanguageFromPath,
    buildLanguageUrl,
    ensureLanguagePrefix,
  };
  ensureLanguagePrefix();
}
