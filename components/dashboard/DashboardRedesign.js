import { createStatsRow } from "./StatsRow.js";
import { createChecklistCard } from "./ChecklistCard.js";

export const applyDashboardRedesign = () => {
  const root = document.getElementById("panel_root");
  if (!root) return;

  const container = root.querySelector(".dashboard-container");
  const main = root.querySelector(".dashboard-main");
  const metrics = root.querySelector(".dashboard-metrics");
  const checklist = root.querySelector(".dashboard-section");

  if (!container || !main || !metrics || !checklist) return;

  container.classList.add("dashboard-redesign");

  if (!main.querySelector(".dashboard-header-section")) {
    const header = document.createElement("section");
    header.className = "dashboard-header-section";

    const title = document.createElement("h1");
    title.className = "dashboard-page-title";
    title.textContent = "Dashboard";

    const subtitle = document.createElement("p");
    subtitle.className = "dashboard-page-subtitle";
    subtitle.textContent = "AI-first workspace overview and launch controls.";

    header.appendChild(title);
    header.appendChild(subtitle);
    main.insertBefore(header, main.firstChild);
  }

  createStatsRow(metrics);
  createChecklistCard(checklist);
  checklist.classList.add("primary-card");

  if (!main.querySelector(".secondary-section")) {
    const section = document.createElement("section");
    section.className = "secondary-section";

    const title = document.createElement("h2");
    title.className = "secondary-title";
    title.textContent = "Recent Bots";

    const list = document.createElement("div");
    list.className = "recent-bots-list";
    list.id = "recent-bots-list";

    section.appendChild(title);
    section.appendChild(list);
    main.appendChild(section);
  }
};
