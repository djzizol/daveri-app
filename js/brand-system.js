import { mountDaVeriPoweredBadge } from "../components/brand/DaVeriPoweredBadge.js";

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

export const applyBrandSystem = () => {
  ensureBotsPageBadge();
  ensureAppearancePreviewBadge();
};

