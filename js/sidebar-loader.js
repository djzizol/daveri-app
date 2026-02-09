import { initSidebar } from "./sidebar.js";
import "./lang-dropdown.js";
import { ensureAppLayout } from "./app-layout.js";

const SIDEBAR_STYLE_ID = "daveri-sidebar-style";
const SIDEBAR_ROOT_ID = "daveri_sidebar";
const SIDEBAR_TEMPLATE_URL = new URL("../components/sidebar.html", import.meta.url);

const waitForAuthReady = async () => {
  const authReady = window?.DaVeriAuth?.ready;
  if (authReady && typeof authReady.then === "function") {
    try {
      await authReady;
    } catch (error) {
      return false;
    }
  }
  return true;
};

const loadSidebarTemplate = async () => {
  const response = await fetch(SIDEBAR_TEMPLATE_URL);
  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const style = doc.querySelector("style");
  const root = doc.getElementById(SIDEBAR_ROOT_ID);

  if (!root) {
    return null;
  }

  return { root, style };
};

const ensureSidebarStyle = (style) => {
  if (!style || document.getElementById(SIDEBAR_STYLE_ID)) {
    return;
  }
  const clone = style.cloneNode(true);
  clone.id = SIDEBAR_STYLE_ID;
  document.head.appendChild(clone);
};

const insertSidebarRoot = (root) => {
  if (document.getElementById(SIDEBAR_ROOT_ID)) {
    return;
  }

  const pageWrapper = document.getElementById("page-wrapper");
  if (pageWrapper?.parentNode) {
    pageWrapper.parentNode.insertBefore(root, pageWrapper);
  } else {
    document.body.prepend(root);
  }
};

const mountSidebar = async () => {
  ensureAppLayout();

  const authReady = await waitForAuthReady();
  if (!authReady) {
    return;
  }

  if (document.getElementById(SIDEBAR_ROOT_ID)) {
    return;
  }

  const template = await loadSidebarTemplate();
  if (!template) {
    return;
  }

  ensureSidebarStyle(template.style);
  insertSidebarRoot(template.root);
  await initSidebar(template.root);
  ensureAppLayout();
  document.dispatchEvent(new CustomEvent("sidebar:mounted"));
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountSidebar, { once: true });
} else {
  mountSidebar();
}
