import { getInitialLanguage, persistLanguage, normalizeLanguage } from "./language.js";

const TRANSLATION_CACHE = new Map();

const loadTranslations = async (lang) => {
  if (TRANSLATION_CACHE.has(lang)) {
    return TRANSLATION_CACHE.get(lang);
  }

  const response = await fetch(`/lang/${lang}.json`);
  if (!response.ok) {
    TRANSLATION_CACHE.set(lang, {});
    return {};
  }

  const data = await response.json();
  TRANSLATION_CACHE.set(lang, data || {});
  return data || {};
};

const getTextForKey = (key, translations, fallback) => {
  if (!key) return fallback;
  return translations[key] ?? fallback ?? key;
};

let currentLanguage = "en";

const applyTranslations = (translations, fallbackTranslations) => {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    const fallback = fallbackTranslations[key] ?? el.textContent;
    el.textContent = getTextForKey(key, translations, fallback);
  });

  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key = el.dataset.i18nHtml;
    const fallback = fallbackTranslations[key] ?? el.innerHTML;
    el.innerHTML = getTextForKey(key, translations, fallback);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    const fallback = fallbackTranslations[key] ?? el.placeholder;
    el.placeholder = getTextForKey(key, translations, fallback);
  });

  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.dataset.i18nTitle;
    const fallback = fallbackTranslations[key] ?? el.title;
    el.title = getTextForKey(key, translations, fallback);
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    const key = el.dataset.i18nAriaLabel;
    const fallback = fallbackTranslations[key] ?? el.getAttribute("aria-label");
    el.setAttribute("aria-label", getTextForKey(key, translations, fallback));
  });
};

const updateLanguageSelectors = (lang) => {
  document.querySelectorAll("[data-language-selector]").forEach((select) => {
    if (select.value !== lang) {
      select.value = lang;
    }
  });
};

export const setLanguage = async (lang) => {
  const normalized = normalizeLanguage(lang) || "en";
  currentLanguage = normalized;
  const [fallbackTranslations, translations] = await Promise.all([
    loadTranslations("en"),
    normalized === "en" ? Promise.resolve({}) : loadTranslations(normalized),
  ]);
  applyTranslations(translations, fallbackTranslations);
  updateLanguageSelectors(normalized);
  persistLanguage(normalized);
  document.dispatchEvent(new CustomEvent("i18n:updated", { detail: { language: normalized } }));
};

export const initI18n = async () => {
  const initialLang = getInitialLanguage();
  await setLanguage(initialLang);

  document.querySelectorAll("[data-language-selector]").forEach((select) => {
    if (select.dataset.languageWired) return;
    select.dataset.languageWired = "true";
    select.addEventListener("change", (event) => {
      setLanguage(event.target.value);
    });
  });
};

export const translatePage = () => setLanguage(currentLanguage);

if (typeof window !== "undefined") {
  window.DaVeriI18n = {
    setLanguage,
    translatePage,
    getCurrentLanguage: () => currentLanguage,
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initI18n, { once: true });
} else {
  initI18n();
}
