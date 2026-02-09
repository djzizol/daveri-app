import { createStatsRow } from "./StatsRow.js";
import { createChecklistCard } from "./ChecklistCard.js";

export const enhanceDashboardPage = () => {
  const root = document.getElementById("panel_root");
  if (!root) return;

  const dashboardContainer = root.querySelector(".dashboard-container");
  const dashboardMain = root.querySelector(".dashboard-main");
  const metrics = root.querySelector(".dashboard-metrics");
  const checklist = root.querySelector(".dashboard-section");

  if (!dashboardContainer || !dashboardMain || !metrics || !checklist) {
    return;
  }

  dashboardContainer.classList.add("dashboard-page");

  if (!dashboardMain.querySelector(".dashboard-header-section")) {
    const header = document.createElement("section");
    header.className = "dashboard-header-section";

    const title = document.createElement("h1");
    title.className = "dashboard-page-title";
    title.textContent = "Dashboard";

    const subtitle = document.createElement("p");
    subtitle.className = "dashboard-page-subtitle";
    subtitle.textContent = "Live control surface for your AI workspace.";

    header.appendChild(title);
    header.appendChild(subtitle);
    dashboardMain.insertBefore(header, dashboardMain.firstChild);
  }

  createStatsRow(metrics);
  createChecklistCard(checklist);
  checklist.classList.add("primary-card");

  if (!dashboardMain.querySelector(".secondary-section")) {
    const section = document.createElement("section");
    section.className = "secondary-section";

    const sectionTitle = document.createElement("h2");
    sectionTitle.className = "secondary-title";
    sectionTitle.textContent = "Recent Bots";

    const list = document.createElement("div");
    list.className = "recent-bots-list";
    list.id = "recent-bots-list";

    section.appendChild(sectionTitle);
    section.appendChild(list);
    dashboardMain.appendChild(section);
  }
};
