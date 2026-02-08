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

const isNonEmptyTranslation = (value) => {
  if (value === null || value === undefined) {
    return false;
  }
  return String(value).trim().length > 0;
};

const getTextForKey = (key, translations, fallbackTranslations) => {
  if (!key) {
    return "[missing-key]";
  }
  const primary = translations[key];
  if (isNonEmptyTranslation(primary)) {
    return String(primary);
  }
  const fallback = fallbackTranslations[key];
  if (isNonEmptyTranslation(fallback)) {
    return String(fallback);
  }
  return `[${key}]`;
};

let currentLanguage = "en";

const applyTranslations = (translations, fallbackTranslations) => {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    el.textContent = getTextForKey(key, translations, fallbackTranslations);
  });

  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key = el.dataset.i18nHtml;
    el.innerHTML = getTextForKey(key, translations, fallbackTranslations);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    el.placeholder = getTextForKey(key, translations, fallbackTranslations);
  });

  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.dataset.i18nTitle;
    el.title = getTextForKey(key, translations, fallbackTranslations);
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    const key = el.dataset.i18nAriaLabel;
    el.setAttribute("aria-label", getTextForKey(key, translations, fallbackTranslations));
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

if (typeof document !== "undefined") {
  document.addEventListener("sidebar:mounted", () => {
    translatePage();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initI18n, { once: true });
} else {
  initI18n();
}
