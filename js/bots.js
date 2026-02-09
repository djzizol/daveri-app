import { initCreateBotModal, openCreateModal } from "./bot-create-modal.js";
import { initEditBotModal, openEditBotModal } from "./bot-edit-modal.js";
import { getApiUrl } from "./api.js";

const API_BASE = getApiUrl("/api/bots");
const CREATE_MODAL_URL = new URL("../components/bot-create-modal.html", import.meta.url);
const EDIT_MODAL_URL = new URL("../components/bot-edit-modal.html", import.meta.url);
const BOT_ICON_URL = "https://d98a890ebc03293bc70c4f2e92e9e2e5.cdn.bubble.io/f1770249140796x253773293772721950/boty.svg";

const grid = document.getElementById("botGrid");
const createBtnId = "create-bot-button";

const getBotsPayload = async (response) => {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    return [];
  }
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.bots)) return payload.bots;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
};

const createStatusMarkup = (enabled) => {
  const cls = enabled ? "online" : "offline";
  const label = enabled ? "Enabled" : "Disabled";
  return `
    <div class="bot-status">
      <div class="bot-status-dot ${cls}"></div>
      <span style="color: var(--dv-muted)">${label}</span>
    </div>
  `;
};

const renderCreateCard = () => {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "bot-card-create";
  card.id = createBtnId;
  card.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
    <span>Create Bot</span>
  `;
  card.addEventListener("click", () => openCreateModal());
  return card;
};

const ensureCreateButtonBound = () => {
  const button = document.getElementById(createBtnId);
  if (!button || button.dataset.boundCreate === "1") return;
  button.dataset.boundCreate = "1";
  button.addEventListener("click", () => openCreateModal());
};

const renderBotCard = (bot) => {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "bot-card";
  card.dataset.botId = bot.id;
  card.innerHTML = `
    ${createStatusMarkup(!!bot.enabled)}
    <div class="bot-card-header">
      <div class="bot-avatar">
        <img src="${BOT_ICON_URL}" alt="Bot" />
      </div>
      <div>
        <div class="bot-name">${escapeHtml(bot.name || "Unnamed Bot")}</div>
        <div class="bot-model">${escapeHtml(bot.preset || "support")}</div>
      </div>
    </div>
    <div class="bot-stats">
      <div>
        <div class="bot-stat-label">Bot ID</div>
        <div class="bot-stat-value bot-stat-value-id">${escapeHtml((bot.id || "").slice(0, 8) || "-")}</div>
      </div>
      <div>
        <div class="bot-stat-label">Created</div>
        <div class="bot-stat-value bot-stat-value-date">${escapeHtml(formatDate(bot.created_at))}</div>
      </div>
    </div>
  `;
  card.addEventListener("click", () => openEditBotModal(bot));
  return card;
};

const renderEmptyState = () => {
  const wrap = document.createElement("div");
  wrap.className = "empty-state";
  wrap.innerHTML = `
    <div class="empty-state-icon">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A3.375 3.375 0 0011.25 11.625V14.25m6.75 0v2.625A3.375 3.375 0 0114.625 20.25h-5.25A3.375 3.375 0 016 16.875V14.25m13.5 0H6" />
      </svg>
    </div>
    <div class="empty-state-title">No bots yet</div>
    <div class="empty-state-desc">Create your first bot to start building conversations.</div>
  `;
  return wrap;
};

const renderLoadError = () => {
  const wrap = document.createElement("div");
  wrap.className = "empty-state";
  wrap.innerHTML = `
    <div class="empty-state-title">Could not load bots</div>
    <div class="empty-state-desc">You can still create a new bot now.</div>
  `;
  return wrap;
};

const loadBots = async () => {
  if (!grid) return;

  try {
    const response = await fetch(API_BASE, { method: "GET", credentials: "include" });
    if (!response.ok) {
      console.error("[Bots] GET failed:", response.status, response.statusText);
      grid.innerHTML = "";
      grid.appendChild(renderCreateCard());
      grid.appendChild(renderLoadError());
      return;
    }

    const bots = await getBotsPayload(response);
    grid.innerHTML = "";
    grid.appendChild(renderCreateCard());

    if (!bots.length) {
      grid.appendChild(renderEmptyState());
      return;
    }

    bots.forEach((bot) => {
      grid.appendChild(renderBotCard(bot));
    });
  } catch (error) {
    console.error("[Bots] Request failed:", error);
    grid.innerHTML = "";
    grid.appendChild(renderCreateCard());
    grid.appendChild(renderLoadError());
  }
};

const injectComponent = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot load component: ${url}`);
  const html = await response.text();
  const mount = document.createElement("div");
  mount.innerHTML = html;
  document.body.append(...Array.from(mount.children));
};

const ensureModalsMounted = async () => {
  if (!document.getElementById("create-bot-modal")) {
    await injectComponent(CREATE_MODAL_URL);
  }
  if (!document.getElementById("edit-bot-modal")) {
    await injectComponent(EDIT_MODAL_URL);
  }
};

const init = async () => {
  ensureCreateButtonBound();

  try {
    await ensureModalsMounted();
  } catch (error) {
    console.error("[Bots] Modal injection failed:", error);
  }

  initCreateBotModal({ onReloadBots: loadBots });
  initEditBotModal({ onReloadBots: loadBots });

  await loadBots();
};

window.DaVeriBots = { loadBots };

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
