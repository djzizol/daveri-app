const SUPPORTED_LANGS = new Set(["en", "pl", "de", "fr", "es", "pt"]);

const getCurrentLanguage = () => {
  const languageApi = window.DaVeriLanguage;
  if (languageApi?.getCurrentLanguage) {
    return languageApi.getCurrentLanguage();
  }

  const segments = window.location.pathname.split("/").filter(Boolean);
  const candidate = segments[0];
  if (candidate && SUPPORTED_LANGS.has(candidate)) {
    return candidate;
  }

  return "en";
};

const normalizePath = (rawPath) => {
  if (typeof rawPath !== "string") return "/";
  const trimmed = rawPath.trim();
  if (!trimmed) return "/";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const localizePath = (rawPath) => {
  const normalizedPath = normalizePath(rawPath);
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;

  const languageApi = window.DaVeriLanguage;
  const language = getCurrentLanguage();
  if (languageApi?.buildLanguageUrl) {
    return languageApi.buildLanguageUrl(language, {
      pathname: normalizedPath,
      search: "",
      hash: "",
    });
  }

  return `/${language}${normalizedPath}`;
};

const updateLocalizedLinks = (root = document) => {
  root.querySelectorAll("[data-marketing-path]").forEach((link) => {
    const targetPath = link.getAttribute("data-marketing-path");
    if (!targetPath) return;
    link.setAttribute("href", localizePath(targetPath));
  });
};

const syncFooterYear = (root = document) => {
  const year = new Date().getFullYear();
  root.querySelectorAll("[data-marketing-year]").forEach((node) => {
    node.textContent = String(year);
  });
};

const initMarketingShell = async () => {
  syncFooterYear(document);
  updateLocalizedLinks(document);
};

const boot = () => {
  initMarketingShell().catch((error) => {
    console.error("[MARKETING SHELL] failed to initialize", error);
  });
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}

document.addEventListener("language:changed", () => {
  updateLocalizedLinks(document);
});

window.DaVeriMarketingShell = {
  init: initMarketingShell,
  refreshLinks: () => updateLocalizedLinks(document),
};
