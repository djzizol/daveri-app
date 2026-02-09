import { createAppLayout } from "../components/layout/AppLayout.js";
import { createSidebarLayer } from "../components/layout/Sidebar.js";
import { createMainContentLayer } from "../components/layout/MainContent.js";
import { mountAgentDock } from "../components/agent/AgentDock.js";
import { enhanceDashboardPage } from "../components/dashboard/DashboardPage.js";

const APP_LAYOUT_STYLE_ID = "daveri-app-layout-style";
const APP_LAYOUT_STYLE_URL = new URL("../css/agent-dock.css", import.meta.url);

const ensureGlobalStyles = () => {
  if (document.getElementById(APP_LAYOUT_STYLE_ID)) return;
  const link = document.createElement("link");
  link.id = APP_LAYOUT_STYLE_ID;
  link.rel = "stylesheet";
  link.href = APP_LAYOUT_STYLE_URL.href;
  document.head.appendChild(link);
};

export const ensureAppLayout = () => {
  ensureGlobalStyles();

  const wrapper = createAppLayout();
  if (!wrapper) return;

  createSidebarLayer();
  createMainContentLayer();

  mountAgentDock();

  if (window.location.pathname.includes("/dashboard")) {
    enhanceDashboardPage();
  }
};
