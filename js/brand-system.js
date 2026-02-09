import { mountDaVeriPoweredBadge } from "../components/brand/DaVeriPoweredBadge.js";

const ICON_BY_PAGE = {
  dashboard: "/assets/icons/dashboard.svg",
  bots: "/assets/icons/bot.svg",
  history: "/assets/icons/history.svg",
  appearance: "/assets/icons/appearance.svg",
  files: "/assets/icons/files.svg",
  install: "/assets/icons/install.svg",
};

const ROOT_TO_PAGE = {
  panel_root: "dashboard",
  boty_root: "bots",
  historia_root: "history",
  pliki_root: "files",
  instalacja_root: "install",
};

const SUPPORTED_LANGS = new Set(["en", "pl", "de", "fr", "es", "pt"]);

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
  if (route in ICON_BY_PAGE) return route;
  return null;
};

const createHeaderIcon = (src) => {
  const icon = document.createElement("div");
  icon.className = "daveri-page-icon";
  icon.setAttribute("data-daveri-page-icon", "true");

  const image = document.createElement("img");
  image.src = src;
  image.alt = "";
  image.width = 18;
  image.height = 18;
  image.decoding = "async";

  icon.appendChild(image);
  return icon;
};

const ensureStandardPageHeaderIcon = (iconSrc) => {
  if (!iconSrc) return;
  const pageHeader = document.querySelector(".page-header");
  const pageTitle = pageHeader?.querySelector(".page-title");
  if (!pageHeader || !pageTitle) return;
  if (pageHeader.querySelector("[data-daveri-page-icon='true']")) return;

  let textHost = pageHeader.querySelector(".page-header-text");
  const subtitle = pageHeader.querySelector(".page-subtitle");

  if (!textHost) {
    textHost = document.createElement("div");
    textHost.className = "page-header-text";
    pageHeader.prepend(textHost);
    textHost.appendChild(pageTitle);
    if (subtitle) {
      textHost.appendChild(subtitle);
    }
  }

  const row = document.createElement("div");
  row.className = "daveri-page-heading";
  row.appendChild(createHeaderIcon(iconSrc));
  row.appendChild(pageTitle);
  textHost.prepend(row);
};

const ensureDashboardHeaderIcon = () => {
  const title = document.querySelector(".dashboard-page-title");
  if (!title || title.closest(".daveri-page-heading")) return;
  const subtitle = document.querySelector(".dashboard-page-subtitle");
  const host = title.parentElement;
  if (!host) return;

  const row = document.createElement("div");
  row.className = "daveri-page-heading daveri-page-heading-dashboard";
  row.appendChild(createHeaderIcon(ICON_BY_PAGE.dashboard));
  row.appendChild(title);
  host.prepend(row);
  if (subtitle) {
    host.appendChild(subtitle);
  }
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
