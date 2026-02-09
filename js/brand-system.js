import { mountDaVeriPoweredBadge } from "../components/brand/DaVeriPoweredBadge.js";

const ICON_BY_PAGE = {
  dashboard: "/assets/icons/dashboard.svg",
  bots: "/assets/icons/bot.svg",
  history: "/assets/icons/history.svg",
  prompts: "/assets/icons/prompt.svg",
  appearance: "/assets/icons/appearance.svg",
  files: "/assets/icons/files.svg",
  install: "/assets/icons/install.svg",
  settings: "/assets/icons/settings.svg",
};

const ROOT_TO_PAGE = {
  panel_root: "dashboard",
  boty_root: "bots",
  historia_root: "history",
  prompt_root: "prompts",
  pliki_root: "files",
  instalacja_root: "install",
  settings_root: "settings",
};

const ROUTE_TO_PAGE = {
  prompt: "prompts",
  prompts: "prompts",
};

const SUPPORTED_LANGS = new Set(["en", "pl", "de", "fr", "es", "pt"]);

const ensureTagName = (node, tagName) => {
  if (!node) return null;
  if (node.tagName?.toLowerCase() === tagName) return node;

  const replacement = document.createElement(tagName);
  Array.from(node.attributes || []).forEach((attr) => {
    replacement.setAttribute(attr.name, attr.value);
  });
  replacement.innerHTML = node.innerHTML;
  node.replaceWith(replacement);
  return replacement;
};

const ensureBotsPageBadge = () => {
  const pageHeader = document.querySelector("#boty_root .page-header");
  if (!pageHeader) return;
  mountDaVeriPoweredBadge(pageHeader, { className: "bots-powered-badge" });
};

const ensureAppearancePreviewBadge = () => {
  const previewLabel = document.querySelector("#dv-configurator .preview-section .section-label");
  if (!previewLabel) return;

  const host = previewLabel.parentElement;
  if (!host) return;

  if (host.querySelector(".widget-preview-badge")) return;

  const badge = mountDaVeriPoweredBadge(host, { className: "widget-preview-badge" });
  if (!badge) return;
  previewLabel.insertAdjacentElement("afterend", badge);
};

const resolvePageKey = () => {
  const pageRoot = document.querySelector(".page[id]");
  if (pageRoot && ROOT_TO_PAGE[pageRoot.id]) {
    return ROOT_TO_PAGE[pageRoot.id];
  }

  const segments = window.location.pathname.split("/").filter(Boolean);
  const head = segments[0];
  if (head && SUPPORTED_LANGS.has(head)) {
    segments.shift();
  }
  const route = segments[0] || "";
  if (ROUTE_TO_PAGE[route]) return ROUTE_TO_PAGE[route];
  if (route in ICON_BY_PAGE) return route;
  return null;
};

const createHeaderIcon = (src) => {
  const icon = document.createElement("div");
  icon.className = "page-header-icon";
  icon.setAttribute("data-page-header-icon", "true");

  const image = document.createElement("img");
  image.src = src;
  image.alt = "";
  image.width = 20;
  image.height = 20;
  image.decoding = "async";

  icon.appendChild(image);
  return icon;
};

const ensureStandardPageHeaderIcon = (iconSrc) => {
  if (!iconSrc) return;
  const pageHeader = document.querySelector(".page-header");
  if (!pageHeader) return;
  const pageTitle = ensureTagName(pageHeader.querySelector(".page-title"), "h1");
  if (!pageTitle) return;
  if (pageHeader.querySelector(".page-header-icon, [data-page-header-icon='true'], .daveri-page-icon, [data-daveri-page-icon='true']")) {
    return;
  }

  let textHost = pageHeader.querySelector(".page-header-text");
  const subtitle = ensureTagName(pageHeader.querySelector(".page-subtitle"), "p");

  if (!textHost || textHost === pageHeader) {
    textHost = document.createElement("div");
    textHost.className = "page-header-text";
  }

  if (pageTitle.parentElement !== textHost) {
    textHost.appendChild(pageTitle);
  }
  if (subtitle && subtitle.parentElement !== textHost) {
    textHost.appendChild(subtitle);
  }

  const main = document.createElement("div");
  main.className = "page-header-main";
  main.appendChild(createHeaderIcon(iconSrc));
  main.appendChild(textHost);
  pageHeader.prepend(main);
};

const ensureDashboardHeaderIcon = () => {
  const title = document.querySelector(".dashboard-page-title");
  if (!title || title.closest(".page-header-main, .daveri-page-heading")) return;
  const subtitle = document.querySelector(".dashboard-page-subtitle");
  const host = title.parentElement;
  if (!host) return;
  if (host.querySelector(".page-header-icon, [data-page-header-icon='true'], .daveri-page-icon, [data-daveri-page-icon='true']")) {
    return;
  }

  const textHost = document.createElement("div");
  textHost.className = "page-header-text";
  textHost.appendChild(title);
  if (subtitle) {
    textHost.appendChild(subtitle);
  }

  const main = document.createElement("div");
  main.className = "page-header-main page-header-main-dashboard";
  main.appendChild(createHeaderIcon(ICON_BY_PAGE.dashboard));
  main.appendChild(textHost);
  host.prepend(main);
};

const ensurePageHeaderIconSystem = () => {
  const key = resolvePageKey();
  if (!key || !ICON_BY_PAGE[key]) return;
  ensureStandardPageHeaderIcon(ICON_BY_PAGE[key]);
  if (key === "dashboard") {
    ensureDashboardHeaderIcon();
  }
};

export const applyBrandSystem = () => {
  ensureBotsPageBadge();
  ensureAppearancePreviewBadge();
  ensurePageHeaderIconSystem();
};
