import { apiFetch, getApiUrl } from "./api.js";

const ACTIVE_BOT_KEY = "daveri_active_bot_id";
const API_BOTS = getApiUrl("/api/bots");

const extractBots = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.bots)) return payload.bots;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

export const getActiveBotId = () => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(ACTIVE_BOT_KEY);
  if (!raw || !raw.trim()) return null;
  return raw.trim();
};

export const setActiveBotId = (botId) => {
  if (typeof window === "undefined") return;
  const value = typeof botId === "string" ? botId.trim() : "";
  if (!value) {
    window.localStorage.removeItem(ACTIVE_BOT_KEY);
    return;
  }
  window.localStorage.setItem(ACTIVE_BOT_KEY, value);
  window.dispatchEvent(new CustomEvent("daveri:active-bot-changed", { detail: { botId: value } }));
};

export const resolveActiveBot = async (options = {}) => {
  const response = await apiFetch(options.apiBots || API_BOTS, {
    method: "GET",
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch bots (${response.status})`);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const bots = extractBots(payload);
  if (!bots.length) {
    setActiveBotId("");
    return { botId: null, bots };
  }

  const stored = getActiveBotId();
  const exists = stored ? bots.some((bot) => String(bot?.id) === String(stored)) : false;
  const botId = exists ? stored : String(bots[0].id || "");
  setActiveBotId(botId);
  return { botId, bots };
};
