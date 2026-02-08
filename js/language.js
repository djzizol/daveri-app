const SUPPORTED_LANGS = ["en", "pl", "de", "fr", "es", "pt"];
const COOKIE_NAME = "lang";

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

export const getInitialLanguage = () => {
  const fromCookie = normalizeLang(getCookie(COOKIE_NAME));
  if (fromCookie) return fromCookie;
  const fromBrowser = detectBrowserLang();
  if (fromBrowser) return fromBrowser;
  return "en";
};

export const persistLanguage = (lang) => {
  const normalized = normalizeLang(lang) || "en";
  setCookie(COOKIE_NAME, normalized);
};

export const getSupportedLanguages = () => [...SUPPORTED_LANGS];

export const normalizeLanguage = normalizeLang;
