import { agentDockStore } from "../../js/agent-dock-store.js";
import { getActiveBotId } from "../../js/active-bot.js";
import { getApiUrl } from "../../js/api.js";
import {
  applyPlanUpgrade,
  consumeMessageCredit,
  refreshCredits,
} from "../../js/account-state.js";
import { createAIMessages } from "./AIMessages.js";
import { createAIInput } from "./AIInput.js";

const AI_WINDOW_ID = "aiWindow";
const COLLAPSED_HEIGHT = 92;
const ASK_ENDPOINT = getApiUrl("/v1/ask");
const conversationsByBot = new Map();

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const parseJsonSafe = (value, fallback = null) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const pickAskAnswer = (payload) => {
  if (typeof payload === "string") return payload;
  if (!isObject(payload)) return "";

  const candidates = [payload.answer, payload.output, payload.reply, payload.message];
  for (const candidate of candidates) {
    if (typeof candidate === "string") return candidate;
    if (candidate !== null && candidate !== undefined && typeof candidate !== "object") {
      return String(candidate);
    }
  }
  return "";
};

const pickConversationId = (payload) => {
  if (!isObject(payload)) return null;
  const candidate = payload.conversation_id ?? payload.conversationId ?? null;
  if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  return null;
};

const applyState = (windowNode, state) => {
  const targetHeight = state.isExpanded ? state.height : COLLAPSED_HEIGHT;
  windowNode.style.height = `${targetHeight}px`;
  windowNode.classList.toggle("is-expanded", state.isExpanded);
  windowNode.classList.toggle("is-collapsed", !state.isExpanded);
  document.documentElement.style.setProperty("--agent-dock-current-height", `${targetHeight}px`);
};

const getVisitorId = () => {
  const fromAuth = window?.DaVeriAuth?.user?.id;
  if (typeof fromAuth === "string" && fromAuth.trim()) return fromAuth.trim();

  const fromSidebar = document.getElementById("daveri_sidebar")?.dataset?.userId;
  if (typeof fromSidebar === "string" && fromSidebar.trim()) return fromSidebar.trim();

  return "dashboard-user";
};

const askAssistant = async (botId, userMessage) => {
  const conversationId = conversationsByBot.get(botId) || null;
  const response = await fetch(ASK_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bot_id: botId,
      visitor_id: getVisitorId(),
      conversation_id: conversationId,
      message: userMessage,
      history: [],
    }),
  });

  const rawText = await response.text();
  const payload = parseJsonSafe(rawText, rawText);

  if (!response.ok) {
    if (isObject(payload) && (payload.error || payload.details)) {
      throw new Error(String(payload.details || payload.error));
    }
    throw new Error(rawText || `HTTP ${response.status}`);
  }

  const answer = pickAskAnswer(payload);
  const nextConversationId = pickConversationId(payload);
  if (nextConversationId) {
    conversationsByBot.set(botId, nextConversationId);
  }

  return answer;
};

const createAIWindowNode = () => {
  const windowNode = document.createElement("section");
  windowNode.id = AI_WINDOW_ID;
  windowNode.className = "ai-window is-collapsed";

  const container = document.createElement("div");
  container.className = "chat-container";

  const messagesWrap = document.createElement("div");
  messagesWrap.className = "chat-messages-wrap ai-messages-wrap";

  const messages = createAIMessages();

  let paywallVisible = false;
  let upgrading = false;
  let sendingMessage = false;

  const paywall = document.createElement("div");
  paywall.className = "ai-paywall";
  paywall.hidden = true;
  paywall.innerHTML = `
    <div class="ai-paywall-card">
      <h3>Wykorzystales wszystkie kredyty</h3>
      <p>Odblokuj wyzszy plan, aby kontynuowac rozmowe.</p>
      <ul class="ai-paywall-benefits">
        <li>Wiekszy pakiet kredytow monthly + daily.</li>
        <li>Wiecej funkcji konfiguratora i brandingu.</li>
        <li>Szybsze wdrozenie bota bez ograniczen.</li>
      </ul>
      <div class="ai-paywall-actions">
        <button type="button" class="ai-paywall-btn ai-paywall-upgrade">Upgrade plan</button>
        <button type="button" class="ai-paywall-btn ai-paywall-close">Close</button>
      </div>
    </div>
  `;

  const paywallUpgradeBtn = paywall.querySelector(".ai-paywall-upgrade");
  const paywallCloseBtn = paywall.querySelector(".ai-paywall-close");

  const setPaywallVisible = (visible) => {
    paywallVisible = Boolean(visible);
    paywall.hidden = !paywallVisible;
    container.classList.toggle("is-paywall-open", paywallVisible);
  };

  const input = createAIInput({
    onActivate: () => {
      if (!paywallVisible) {
        agentDockStore.setExpanded(true);
      }
    },
    onSend: async (content) => {
      if (sendingMessage) return { accepted: false };
      sendingMessage = true;

      const text = String(content || "").trim();
      if (!text) {
        sendingMessage = false;
        return { accepted: false };
      }

      const botId = getActiveBotId();
      if (!botId) {
        agentDockStore.addMessage({
          role: "assistant",
          content: "Select an active bot first to start chatting.",
        });
        sendingMessage = false;
        return { accepted: false };
      }

      try {
        let consumeResult = null;
        try {
          consumeResult = await consumeMessageCredit(1);
        } catch (error) {
          console.error("[AIWindow] consume_message_credit failed", {
            code: error?.code || null,
            message: error?.message || "unknown_error",
          });
          agentDockStore.addMessage({
            role: "assistant",
            content: "Could not validate your credits right now. Try again in a moment.",
          });
          return { accepted: false };
        }

        if (consumeResult?.allowed !== true) {
          setPaywallVisible(true);
          agentDockStore.addMessage({
            role: "assistant",
            content: "Wykorzystales wszystkie kredyty. Kliknij Upgrade plan, aby kontynuowac.",
          });
          return { accepted: false };
        }

        setPaywallVisible(false);
        agentDockStore.addMessage({ role: "user", content: text });

        try {
          const answer = await askAssistant(botId, text);
          agentDockStore.addMessage({
            role: "assistant",
            content: answer || "I could not generate a response right now.",
          });
        } catch (error) {
          console.error("[AIWindow] ask failed", error);
          agentDockStore.addMessage({
            role: "assistant",
            content: "The assistant is temporarily unavailable. Your message was received.",
          });
        } finally {
          try {
            await refreshCredits();
          } catch (error) {
            console.warn("[AIWindow] credit refresh failed", error);
          }
        }

        return { accepted: true };
      } finally {
        sendingMessage = false;
      }
    },
  });

  paywallCloseBtn?.addEventListener("click", () => {
    setPaywallVisible(false);
  });

  paywallUpgradeBtn?.addEventListener("click", async () => {
    if (upgrading) return;
    upgrading = true;
    paywallUpgradeBtn.disabled = true;
    paywallUpgradeBtn.textContent = "Upgrading...";

    try {
      await applyPlanUpgrade("premium");
      setPaywallVisible(false);
      agentDockStore.addMessage({
        role: "assistant",
        content: "Plan upgraded to Premium. Credits are ready.",
      });
    } catch (error) {
      console.error("[AIWindow] upgrade failed", error);
      agentDockStore.addMessage({
        role: "assistant",
        content: "Upgrade failed. Please try again.",
      });
    } finally {
      upgrading = false;
      paywallUpgradeBtn.disabled = false;
      paywallUpgradeBtn.textContent = "Upgrade plan";
    }
  });

  const footer = document.createElement("div");
  footer.className = "chat-footer";

  const poweredBy = document.createElement("div");
  poweredBy.className = "powered-by";

  const poweredText = document.createElement("span");
  poweredText.textContent = "Powered by";

  const poweredBrand = document.createElement("img");
  poweredBrand.src = "/assets/icons/poweredby.svg";
  poweredBrand.alt = "DaVeri";
  poweredBrand.className = "powered-by-brand";
  poweredBrand.decoding = "async";

  poweredBy.appendChild(poweredText);
  poweredBy.appendChild(poweredBrand);
  footer.appendChild(poweredBy);

  const minimize = document.createElement("button");
  minimize.type = "button";
  minimize.className = "chat-minimize ai-window-minimize";
  minimize.setAttribute("aria-label", "Toggle AI window");
  minimize.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </svg>
  `;
  minimize.addEventListener("click", () => {
    const state = agentDockStore.getState();
    agentDockStore.setExpanded(!state.isExpanded);
  });

  messagesWrap.appendChild(messages.node);
  container.appendChild(minimize);
  container.appendChild(messagesWrap);
  container.appendChild(input.node);
  container.appendChild(footer);
  container.appendChild(paywall);
  windowNode.appendChild(container);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const active = document.activeElement;
      if (active === input.input) {
        agentDockStore.setExpanded(false);
      }
      if (paywallVisible) {
        setPaywallVisible(false);
      }
    }
  });

  const sync = (state) => {
    applyState(windowNode, state);
    messages.render(state.messages);
    minimize.innerHTML = state.isExpanded
      ? `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>`
      : `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 12h12M12 6v12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>`;
    minimize.setAttribute("aria-label", state.isExpanded ? "Minimize AI window" : "Expand AI window");
  };

  sync(agentDockStore.getState());
  agentDockStore.subscribe(sync);

  return windowNode;
};

export const mountAIWindow = () => {
  const existing = document.getElementById(AI_WINDOW_ID);
  if (existing) return existing;

  const windowNode = createAIWindowNode();
  document.body.appendChild(windowNode);
  return windowNode;
};
