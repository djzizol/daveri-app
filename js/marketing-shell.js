const SUPPORTED_LANGS = new Set(["en", "pl", "de", "fr", "es", "pt"]);
const FOOTER_TEMPLATE_URL = new URL("../components/marketing-footer.html", import.meta.url);

let footerTemplatePromise = null;

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

const getFooterTemplate = async () => {
  if (!footerTemplatePromise) {
    footerTemplatePromise = fetch(FOOTER_TEMPLATE_URL, { cache: "no-cache" })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Cannot load footer template: ${response.status}`);
        }
        return response.text();
      })
      .catch((error) => {
        footerTemplatePromise = null;
        throw error;
      });
  }
  return footerTemplatePromise;
};

const mountFooterHosts = async (root = document) => {
  const hosts = Array.from(root.querySelectorAll("[data-marketing-footer-host]"));
  if (hosts.length === 0) return;

  const template = await getFooterTemplate();
  hosts.forEach((host) => {
    if (host.dataset.marketingFooterMounted === "1") return;
    host.innerHTML = template;
    host.dataset.marketingFooterMounted = "1";
  });
};

const initMarketingShell = async () => {
  await mountFooterHosts(document);
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
  mountFooter: () => mountFooterHosts(document),
  refreshLinks: () => updateLocalizedLinks(document),
};
