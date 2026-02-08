const SUPPORTED_LANGS = ["en", "pl"];
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

const resolveInitialLanguage = () => {
  const fromCookie = normalizeLang(getCookie(COOKIE_NAME));
  if (fromCookie) return fromCookie;
  const fromBrowser = detectBrowserLang();
  if (fromBrowser) return fromBrowser;
  return "en";
};

export const getCurrentLanguage = () => {
  if (!currentLanguage) {
    currentLanguage = resolveInitialLanguage();
  }
  return currentLanguage;
};

export const setCurrentLanguage = (lang) => {
  const normalized = normalizeLang(lang) || "en";
  currentLanguage = normalized;
  setCookie(COOKIE_NAME, normalized);
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent("language:changed", { detail: { language: normalized } }));
  }
  return normalized;
};

export const getSupportedLanguages = () => [...SUPPORTED_LANGS];

export const normalizeLanguage = normalizeLang;
