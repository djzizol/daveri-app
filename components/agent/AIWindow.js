import { agentDockStore } from "../../js/agent-dock-store.js";
import { getActiveBotId } from "../../js/active-bot.js";
import { getApiUrl } from "../../js/api.js";
import {
  applyPlanUpgrade,
  consumeMessageCredit,
  ensureAccountState,
  getAccountState,
  refreshCredits,
  refreshEntitlements,
} from "../../js/account-state.js";
import { createAIMessages } from "./AIMessages.js";
import { createAIInput } from "./AIInput.js";

const AI_WINDOW_ID = "aiWindow";
const COLLAPSED_HEIGHT = 92;
const ASK_ENDPOINT = getApiUrl("/v1/ask");
const conversationsByBot = new Map();
const AI_ACCESS_FALLBACK_ALLOWED_PLANS = new Set(["basic", "premium", "pro", "individual"]);
const PAYWALL_REASON_CREDITS = "credits";
const PAYWALL_REASON_AI_LOCKED = "ai_locked";
const AI_LOCK_MESSAGE = "Odblokuj dostep do funkcji DaVeri AI przechodzac na wyzszy plan.";

const PAYWALL_COPY = {
  [PAYWALL_REASON_CREDITS]: {
    title: "DaVeri AI jest zablokowane",
    description: AI_LOCK_MESSAGE,
    benefits: [
      "Odblokujesz funkcje DaVeri AI.",
      "Uzyskasz wiecej mozliwosci automatyzacji.",
      "Skorzystasz z pelnego potencjalu asystenta.",
    ],
    assistant: AI_LOCK_MESSAGE,
  },
  [PAYWALL_REASON_AI_LOCKED]: {
    title: "DaVeri AI jest zablokowane",
    description: AI_LOCK_MESSAGE,
    benefits: [
      "Odblokujesz funkcje DaVeri AI.",
      "Uzyskasz wiecej mozliwosci automatyzacji.",
      "Skorzystasz z pelnego potencjalu asystenta.",
    ],
    assistant: AI_LOCK_MESSAGE,
  },
};

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

const normalizePlanId = (value) => {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
};

const getAuthPlanId = () => normalizePlanId(window?.DaVeriAuth?.user?.plan_id || "");

const isPaidPlanId = (planId) => {
  const normalized = normalizePlanId(planId);
  return normalized ? AI_ACCESS_FALLBACK_ALLOWED_PLANS.has(normalized) : false;
};

const getAiFeatureAccess = async () => {
  try {
    await ensureAccountState();
  } catch {}

  let state = getAccountState();
  let entitlements = isObject(state?.entitlements_map) ? state.entitlements_map : {};
  let aiFeature = isObject(entitlements?.daverei_ai) ? entitlements.daverei_ai : null;
  let aiMode = isObject(entitlements?.daverei_ai_mode) ? entitlements.daverei_ai_mode : null;

  if (!aiFeature && !Object.keys(entitlements).length) {
    try {
      await refreshEntitlements();
      state = getAccountState();
      entitlements = isObject(state?.entitlements_map) ? state.entitlements_map : {};
      aiFeature = isObject(entitlements?.daverei_ai) ? entitlements.daverei_ai : null;
      aiMode = isObject(entitlements?.daverei_ai_mode) ? entitlements.daverei_ai_mode : null;
    } catch {}
  }

  const planId = normalizePlanId(state?.credits?.plan_id || "") || getAuthPlanId();
  if (aiFeature?.enabled === true) return { allowed: true, planId };
  if (aiFeature?.enabled === false) {
    if (isPaidPlanId(planId)) {
      return { allowed: true, planId };
    }
    return { allowed: false, reason: PAYWALL_REASON_AI_LOCKED, planId };
  }

  const mode = String(aiMode?.meta?.mode || "").trim().toLowerCase();
  if (mode && mode !== "none") return { allowed: true, planId };

  if (planId === "free") return { allowed: false, reason: PAYWALL_REASON_AI_LOCKED, planId };
  if (planId && AI_ACCESS_FALLBACK_ALLOWED_PLANS.has(planId)) return { allowed: true, planId };

  // Fail-open for unknown states, do not block paid users due transient entitlement fetch issues.
  return { allowed: true, planId };
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
  let paywallReason = PAYWALL_REASON_CREDITS;
  let upgrading = false;
  let sendingMessage = false;

  const paywall = document.createElement("div");
  paywall.className = "ai-paywall";
  paywall.hidden = true;
  paywall.innerHTML = `
    <div class="ai-paywall-card">
      <h3>DaVeri AI jest zablokowane</h3>
      <p>${AI_LOCK_MESSAGE}</p>
      <ul class="ai-paywall-benefits">
        <li>Odblokujesz funkcje DaVeri AI.</li>
        <li>Uzyskasz wiecej mozliwosci automatyzacji.</li>
        <li>Skorzystasz z pelnego potencjalu asystenta.</li>
      </ul>
      <div class="ai-paywall-actions">
        <button type="button" class="ai-paywall-btn ai-paywall-upgrade">Przejdz na wyzszy plan</button>
        <button type="button" class="ai-paywall-btn ai-paywall-close">Close</button>
      </div>
    </div>
  `;

  const paywallUpgradeBtn = paywall.querySelector(".ai-paywall-upgrade");
  const paywallCloseBtn = paywall.querySelector(".ai-paywall-close");
  const paywallTitle = paywall.querySelector("h3");
  const paywallDescription = paywall.querySelector("p");
  const paywallBenefits = paywall.querySelector(".ai-paywall-benefits");

  const setPaywallContent = (reason) => {
    const key = Object.prototype.hasOwnProperty.call(PAYWALL_COPY, reason) ? reason : PAYWALL_REASON_CREDITS;
    const copy = PAYWALL_COPY[key];
    paywallReason = key;
    paywall.dataset.reason = key;
    if (paywallTitle) paywallTitle.textContent = copy.title;
    if (paywallDescription) paywallDescription.textContent = copy.description;
    if (paywallBenefits) {
      paywallBenefits.innerHTML = "";
      copy.benefits.forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        paywallBenefits.appendChild(li);
      });
    }
    if (paywallUpgradeBtn) {
      paywallUpgradeBtn.textContent = "Przejdz na wyzszy plan";
    }
  };

  const setPaywallVisible = (visible, reason = paywallReason) => {
    if (visible) {
      setPaywallContent(reason);
    }
    paywallVisible = Boolean(visible);
    paywall.hidden = !paywallVisible;
    container.classList.toggle("is-paywall-open", paywallVisible);
  };

  const input = createAIInput({
    onActivate: () => {
      agentDockStore.setExpanded(true);
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
        const access = await getAiFeatureAccess();
        if (!access.allowed) {
          const reason = access.reason || PAYWALL_REASON_AI_LOCKED;
          setPaywallVisible(true, reason);
          agentDockStore.addMessage({
            role: "assistant",
            content: PAYWALL_COPY[reason]?.assistant || PAYWALL_COPY[PAYWALL_REASON_AI_LOCKED].assistant,
          });
          return { accepted: false };
        }

        let consumeResult = null;
        try {
          consumeResult = await consumeMessageCredit(1);
        } catch (error) {
          console.error("[AIWindow] consume_message_credit failed", {
            code: error?.code || null,
            message: error?.message || "unknown_error",
          });
          const fallbackCredits = getAccountState()?.credits || null;
          const fallbackRemaining = Number(fallbackCredits?.remaining);
          const fallbackUnlimited = fallbackCredits?.monthly_limit === null;
          const fallbackCapacity = Number(fallbackCredits?.capacity);
          const fallbackPlanId = normalizePlanId(fallbackCredits?.plan_id || access.planId || "");
          const fallbackPaidPlan = isPaidPlanId(fallbackPlanId);
          const fallbackHasCapacity = Number.isFinite(fallbackCapacity) && fallbackCapacity > 0;
          const canProceed =
            fallbackUnlimited ||
            (Number.isFinite(fallbackRemaining) && fallbackRemaining > 0) ||
            (fallbackPaidPlan && !fallbackHasCapacity);

          if (!canProceed) {
            agentDockStore.addMessage({
              role: "assistant",
              content: "Nie moge teraz potwierdzic limitu. Sprobuj ponownie za chwile.",
            });
            return { accepted: false };
          }
        }

        if (consumeResult?.allowed !== true && consumeResult) {
          const status = isObject(consumeResult?.status) ? consumeResult.status : {};
          const remaining = Number(status?.remaining);
          const unlimited = status?.monthly_limit === null;
          const degraded = consumeResult?.raw?.degraded === true;
          const capacity = Number(status?.capacity);
          const planId = normalizePlanId(status?.plan_id || access.planId || getAccountState()?.credits?.plan_id || "");
          const paidPlan = isPaidPlanId(planId);
          const hasCapacity = Number.isFinite(capacity) && capacity > 0;
          const canProceed =
            unlimited ||
            (Number.isFinite(remaining) && remaining > 0) ||
            degraded ||
            (paidPlan && !hasCapacity);

          if (!canProceed) {
            setPaywallVisible(true, PAYWALL_REASON_AI_LOCKED);
            agentDockStore.addMessage({
              role: "assistant",
              content: PAYWALL_COPY[PAYWALL_REASON_AI_LOCKED].assistant,
            });
            return { accepted: false };
          }
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

  paywall.addEventListener("click", (event) => {
    if (event.target === paywall) {
      setPaywallVisible(false);
    }
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
        content: "Plan upgraded. DaVeri AI is ready.",
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
      paywallUpgradeBtn.textContent = "Przejdz na wyzszy plan";
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
    if (!state.isExpanded && paywallVisible) {
      setPaywallVisible(false);
    }
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
