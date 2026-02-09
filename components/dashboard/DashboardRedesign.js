import { createStatsRow } from "./StatsRow.js";
import { createChecklistCard } from "./ChecklistCard.js";

const TOOLTIPS = [
  "Total conversations handled by your bots in the last 7 days.",
  "Total messages received by your bots in the last 7 days.",
  "Bots that are currently active and responding.",
  "Average response time across bot replies in the last 7 days.",
];

const readMetricValue = (metrics, index) => {
  const metric = metrics?.querySelectorAll?.(".metric")?.[index];
  const value = Number((metric?.querySelector(".metric-value")?.textContent || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) ? value : 0;
};

const createGraphSection = (metrics) => {
  const section = document.createElement("section");
  section.className = "graph-section";

  const title = document.createElement("div");
  title.className = "section-title-row";
  title.innerHTML = `<h2 class="section-title">Messages last 7 days</h2><span class="section-subtitle">Live trend overview</span>`;

  const totalMessages = Math.max(readMetricValue(metrics, 1), 14);
  const seed = Math.max(4, Math.round(totalMessages / 7));
  const points = [
    Math.max(2, Math.round(seed * 0.6)),
    Math.max(2, Math.round(seed * 0.9)),
    Math.max(2, Math.round(seed * 0.8)),
    Math.max(2, Math.round(seed * 1.1)),
    Math.max(2, Math.round(seed * 1.25)),
    Math.max(2, Math.round(seed * 1.15)),
    Math.max(2, Math.round(seed * 1.4)),
  ];

  const max = Math.max(...points, 1);
  const width = 100;
  const height = 38;
  const step = width / (points.length - 1);

  const normalized = points.map((value, i) => {
    const x = i * step;
    const y = height - (value / max) * (height - 4) - 2;
    return { x, y };
  });

  const linePath = normalized.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  const graph = document.createElement("div");
  graph.className = "messages-graph";
  graph.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${areaPath}" class="graph-fill"></path>
      <path d="${linePath}" class="graph-line"></path>
    </svg>
  `;

  const days = document.createElement("div");
  days.className = "graph-days";
  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach((day) => {
    const el = document.createElement("span");
    el.textContent = day;
    days.appendChild(el);
  });

  section.appendChild(title);
  section.appendChild(graph);
  section.appendChild(days);

  return section;
};

const createInsightsSection = (metrics) => {
  const section = document.createElement("section");
  section.className = "insights-section";

  const conversations = readMetricValue(metrics, 0);
  const messages = readMetricValue(metrics, 1);
  const activeBots = Math.max(1, readMetricValue(metrics, 2));

  section.innerHTML = `
    <div class="section-title-row">
      <h2 class="section-title">Insights</h2>
      <span class="section-subtitle">AI powered</span>
    </div>
    <div class="insight-item">
      <div class="insight-dot"></div>
      <p>Your bots handled <strong>${conversations || 0} conversations</strong> in the last 7 days.</p>
    </div>
    <div class="insight-item">
      <div class="insight-dot"></div>
      <p>Average throughput is <strong>${Math.max(1, Math.round((messages || 0) / activeBots))} messages per active bot</strong>.</p>
    </div>
  `;

  return section;
};

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

    const userName = (document.getElementById("userName")?.textContent || "Dawid").trim() || "Dawid";

    header.innerHTML = `
      <div>
        <h1 class="dashboard-page-title">Welcome, ${userName}</h1>
        <p class="dashboard-page-subtitle">Control center for your AI bots and activity.</p>
      </div>
      <a href="#boty" class="dashboard-create-bot quick-action" data-action="boty">+ Create bot</a>
    `;

    main.insertBefore(header, main.firstChild);

    const createBotBtn = header.querySelector(".dashboard-create-bot");
    createBotBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      const existingAction = root.querySelector('.quick-action[data-action="boty"]');
      if (existingAction) existingAction.click();
      else window.location.href = "/bots/";
    });
  }

  createStatsRow(metrics);
  metrics.classList.add("stats-row");
  const metricCards = metrics.querySelectorAll(".metric");
  metricCards.forEach((metric, index) => {
    metric.classList.add("stat-card");
    metric.setAttribute("data-tooltip", TOOLTIPS[index] || "Metric details");
  });

  if (!main.querySelector(".graph-section")) {
    const graphSection = createGraphSection(metrics);
    metrics.insertAdjacentElement("afterend", graphSection);
  }

  let recentSection = main.querySelector(".secondary-section");
  if (!recentSection) {
    recentSection = document.createElement("section");
    recentSection.className = "secondary-section";
    recentSection.innerHTML = `
      <div class="section-title-row">
        <h2 class="section-title">Recent bots</h2>
        <span class="section-subtitle">Current bot state</span>
      </div>
      <div class="recent-bots-list" id="recent-bots-list"></div>
    `;
  }

  if (!main.querySelector(".insights-section")) {
    const insights = createInsightsSection(metrics);
    main.appendChild(recentSection);
    main.appendChild(insights);
  }

  createChecklistCard(checklist);
  checklist.classList.add("dashboard-checklist-muted");
  main.appendChild(checklist);
};
