import { agentDockStore } from "../../js/agent-dock-store.js";
import { getActiveBotId } from "../../js/active-bot.js";
import { getApiUrl } from "../../js/api.js";
import {
  getAgentCreditStatusSnapshot,
  refreshAgentCreditStatus,
} from "../../js/agent-credit-status-store.js";
import { callRpcRecord } from "../../js/supabaseClient.js";
import { trackEvent } from "../../js/analytics.js";
import {
  applyPlanUpgrade,
  ensureAccountState,
  getAccountState,
  refreshEntitlements,
} from "../../js/account-state.js";
import { createBotContextPicker } from "./BotContextPicker.js";
import { createCreditHUDRing } from "./CreditHUDRing.js";
import { createModePicker } from "./ModePicker.js";
import { createAIMessages } from "./AIMessages.js";
import { createAIInput } from "./AIInput.js";
import { createQuotaExceededModal } from "./QuotaExceededModal.js";

const AI_WINDOW_ID = "aiWindow";
const COLLAPSED_HEIGHT = 92;
const ASK_ENDPOINT = getApiUrl("/v1/ask");
const SEND_MESSAGE_RPC = "daveri_send_message_credit_limited";
const MAX_CONTEXT_BOTS = 3;
const RETRY_SEND_ACTION = "retry_send_message";
const CANCEL_SEND_ACTION = "cancel_send_message";
const conversationsByContext = new Map();
const askConversationsByBot = new Map();
const AI_ACCESS_FALLBACK_ALLOWED_PLANS = new Set(["basic", "premium", "pro", "individual"]);
const PAYWALL_REASON_AI_LOCKED = "ai_locked";
const PAYWALL_REASON_AUTH = "auth";
const PAYWALL_REASON_ENTITLEMENTS = "entitlements_error";
const AI_LOCK_MESSAGE = "Odblokuj dostep do funkcji DaVeri AI przechodzac na wyzszy plan.";
const AUTH_REQUIRED_MESSAGE = "Nie mozna potwierdzic sesji. Odswiez strone i zaloguj sie ponownie.";
const ENTITLEMENTS_ERROR_MESSAGE =
  "Nie mozemy odczytac uprawnien planu. Odswiez strone lub skontaktuj sie z supportem.";

const PAYWALL_COPY = {
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
  [PAYWALL_REASON_AUTH]: {
    title: "Wymagane ponowne logowanie",
    description: AUTH_REQUIRED_MESSAGE,
    benefits: [
      "Odswiez strone i zaloguj sie ponownie.",
    ],
    assistant: AUTH_REQUIRED_MESSAGE,
  },
  [PAYWALL_REASON_ENTITLEMENTS]: {
    title: "Problem z uprawnieniami planu",
    description: ENTITLEMENTS_ERROR_MESSAGE,
    benefits: [
      "Sprawdz konfiguracje planu i entitlementow.",
      "Odswiez sesje i pobierz status ponownie.",
      "Skontaktuj sie z supportem, jesli problem utrzymuje sie.",
    ],
    assistant: ENTITLEMENTS_ERROR_MESSAGE,
  },
};

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);
const toSafeInt = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
};

const normalizeChatMode = (value) => (value === "operator" ? "operator" : "advisor");
const hasNoCreditsAccess = (usage) => {
  if (!isObject(usage)) return false;
  return toSafeInt(usage.daily_cap) === 0 || toSafeInt(usage.monthly_cap) === 0;
};
const isQuotaExceeded = (usage) => {
  if (!isObject(usage)) return false;
  const dailyCap = toSafeInt(usage.daily_cap);
  const monthlyCap = toSafeInt(usage.monthly_cap);
  const dailyUsed = toSafeInt(usage.daily_used);
  const monthlyUsed = toSafeInt(usage.monthly_used);

  const dailyExceeded = dailyCap > 0 && dailyUsed >= dailyCap;
  const monthlyExceeded = monthlyCap > 0 && monthlyUsed >= monthlyCap;
  return dailyExceeded || monthlyExceeded;
};

const createClientRequestId = () => {
  try {
    if (typeof crypto?.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {}

  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
};

const extractCreditUsage = (value) => {
  if (!isObject(value)) return null;

  const dailyCap = toSafeInt(value.daily_cap);
  const monthlyCap = toSafeInt(value.monthly_cap);
  const dailyUsed = toSafeInt(value.daily_used);
  const monthlyUsed = toSafeInt(value.monthly_used);

  if (!dailyCap && !monthlyCap && !dailyUsed && !monthlyUsed) {
    return null;
  }

  return {
    daily_used: dailyUsed,
    daily_cap: dailyCap,
    monthly_used: monthlyUsed,
    monthly_cap: monthlyCap,
  };
};

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

const normalizeSelectedBotIds = (selectedBotIds) =>
  [...new Set((Array.isArray(selectedBotIds) ? selectedBotIds : []).map((item) => String(item || "").trim()).filter(Boolean))].slice(
    0,
    MAX_CONTEXT_BOTS
  );

const getContextKey = (selectedBotIds) => {
  const normalized = normalizeSelectedBotIds(selectedBotIds);
  if (!normalized.length) return "__default__";
  return normalized.slice().sort().join(",");
};

const applyState = (windowNode, state) => {
  const targetHeight = state.isExpanded ? state.height : COLLAPSED_HEIGHT;
  windowNode.style.height = `${targetHeight}px`;
  windowNode.classList.toggle("is-expanded", state.isExpanded);
  windowNode.classList.toggle("is-collapsed", !state.isExpanded);
  document.documentElement.style.setProperty("--agent-dock-current-height", `${targetHeight}px`);
};

const getVisitorId = () => {
  const fromAuth = window?.DaVeriAuth?.session?.user?.id;
  if (typeof fromAuth === "string" && fromAuth.trim()) return fromAuth.trim();

  const fromSidebar = document.getElementById("daveri_sidebar")?.dataset?.userId;
  if (typeof fromSidebar === "string" && fromSidebar.trim()) return fromSidebar.trim();

  return "dashboard-user";
};

const normalizePlanId = (value) => {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
};

const getAuthPlanId = () =>
  normalizePlanId(
    window?.DaVeriAuth?.session?.user?.user_metadata?.plan_id ||
      window?.DaVeriAuth?.session?.user?.app_metadata?.plan_id ||
      ""
  );
const getCurrentPlanId = () => normalizePlanId(getAccountState()?.credits?.plan_id || "") || getAuthPlanId();

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
  const entitlementsMissingInitially = !Object.keys(entitlements).length;
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
  const entitlementsMissing = !Object.keys(entitlements).length;
  if (entitlementsMissing) {
    if (isPaidPlanId(planId)) {
      return { allowed: true, planId, entitlementsMissing: true };
    }
    return { allowed: false, reason: PAYWALL_REASON_ENTITLEMENTS, planId };
  }

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
  if (entitlementsMissingInitially && isPaidPlanId(planId)) {
    return { allowed: true, planId, entitlementsMissing: true };
  }
  return { allowed: true, planId };
};

const askAssistant = async (botId, userMessage, selectedBotIds = []) => {
  const conversationId = askConversationsByBot.get(botId) || null;
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
      active_bot_id: botId,
      selected_bot_ids: normalizeSelectedBotIds(selectedBotIds),
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
    askConversationsByBot.set(botId, nextConversationId);
  }

  return answer;
};

const sendMessageCreditLimited = async ({
  conversationId = null,
  role = "user",
  content = "",
  meta = {},
  activeBotId = null,
  modeDefault = "advisor",
}) =>
  callRpcRecord(SEND_MESSAGE_RPC, {
    p_cost: 1,
    p_conversation_id: conversationId,
    p_role: role,
    p_content: content,
    p_meta: meta,
    p_active_bot_id: activeBotId,
    p_mode_default: modeDefault,
  });

const applyChatModeToUi = (container, chatMode) => {
  const normalizedMode = chatMode === "operator" ? "operator" : "advisor";
  container.dataset.chatMode = normalizedMode;
  container.classList.toggle("is-chat-mode-advisor", normalizedMode === "advisor");

  const operatorOnlyControls = container.querySelectorAll("[data-requires-operator='true'], .ai-propose-action-btn");
  operatorOnlyControls.forEach((control) => {
    if (!(control instanceof HTMLElement)) return;
    const isButton = control instanceof HTMLButtonElement;
    if (normalizedMode === "advisor") {
      control.setAttribute("aria-hidden", "true");
      control.classList.add("is-disabled-by-mode");
      if (isButton) {
        control.disabled = true;
      }
    } else {
      control.removeAttribute("aria-hidden");
      control.classList.remove("is-disabled-by-mode");
      if (isButton) {
        control.disabled = false;
      }
    }
  });
};

const createAIWindowNode = () => {
  const windowNode = document.createElement("section");
  windowNode.id = AI_WINDOW_ID;
  windowNode.className = "ai-window is-collapsed";

  const container = document.createElement("div");
  container.className = "chat-container";

  const messagesWrap = document.createElement("div");
  messagesWrap.className = "chat-messages-wrap ai-messages-wrap";

  const creditHud = createCreditHUDRing();
  const botContextPicker = createBotContextPicker({ maxSelected: MAX_CONTEXT_BOTS });
  const modePicker = createModePicker();

  const chatHeader = document.createElement("div");
  chatHeader.className = "ai-chat-header";

  const chatHeaderControls = document.createElement("div");
  chatHeaderControls.className = "ai-chat-header-controls";

  const chatHeaderBots = document.createElement("div");
  chatHeaderBots.className = "ai-chat-header-bots";

  const chatHeaderBotsLabel = document.createElement("span");
  chatHeaderBotsLabel.className = "ai-chat-header-label";
  chatHeaderBotsLabel.textContent = "Active bots";

  chatHeaderBots.appendChild(chatHeaderBotsLabel);
  chatHeaderBots.appendChild(botContextPicker.node);

  const chatHeaderMode = document.createElement("div");
  chatHeaderMode.className = "ai-chat-header-mode";

  const chatHeaderModeLabel = document.createElement("span");
  chatHeaderModeLabel.className = "ai-chat-header-label";
  chatHeaderModeLabel.textContent = "Mode";

  chatHeaderMode.appendChild(chatHeaderModeLabel);
  chatHeaderMode.appendChild(modePicker.node);

  const chatHeaderCredits = document.createElement("div");
  chatHeaderCredits.className = "ai-chat-header-credits";
  chatHeaderCredits.appendChild(creditHud.node);

  chatHeaderControls.appendChild(chatHeaderBots);
  chatHeaderControls.appendChild(chatHeaderMode);
  chatHeader.appendChild(chatHeaderControls);
  chatHeader.appendChild(chatHeaderCredits);

  let handleRetryAction = () => {};
  const messages = createAIMessages({
    onAction: (event) => handleRetryAction(event),
  });

  const inflightRequestsById = new Map();
  const inflightRequestIdByKey = new Map();

  let paywallVisible = false;
  let paywallReason = PAYWALL_REASON_AI_LOCKED;
  let upgrading = false;

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
    const key = Object.prototype.hasOwnProperty.call(PAYWALL_COPY, reason) ? reason : PAYWALL_REASON_AI_LOCKED;
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
      paywallUpgradeBtn.hidden = key === PAYWALL_REASON_AUTH;
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

  const refreshCreditStatus = async ({ force = true } = {}) => {
    try {
      await refreshAgentCreditStatus({ force });
    } catch {}
    return extractCreditUsage(getAgentCreditStatusSnapshot()?.data);
  };

  const quotaModal = createQuotaExceededModal({
    onRefreshStatus: () => refreshCreditStatus({ force: true }),
  });

  const setQuotaModalUsage = async ({ forceRefresh = false } = {}) => {
    const fromCache = extractCreditUsage(getAgentCreditStatusSnapshot()?.data);
    if (fromCache && !forceRefresh) {
      quotaModal.setUsage(fromCache);
      return fromCache;
    }

    const refreshed = await refreshCreditStatus({ force: true });
    if (refreshed) {
      quotaModal.setUsage(refreshed);
      return refreshed;
    }

    if (fromCache) {
      quotaModal.setUsage(fromCache);
      return fromCache;
    }

    return null;
  };

  const openQuotaModal = async ({ forceRefresh = false, mode = null } = {}) => {
    const usage = await setQuotaModalUsage({ forceRefresh });
    const resolvedMode = mode || (hasNoCreditsAccess(usage) ? "no_access" : "quota_exceeded");
    if (resolvedMode === "quota_exceeded" && !isQuotaExceeded(usage)) {
      console.warn("[AIWindow] quota modal suppressed: usage does not exceed limits", usage);
      return false;
    }
    if (resolvedMode === "no_access" && !hasNoCreditsAccess(usage)) {
      console.warn("[AIWindow] no-access modal suppressed: usage has valid caps", usage);
      return false;
    }
    quotaModal.open(usage, { mode: resolvedMode });
    trackEvent("quota_exceeded_shown", {
      mode: resolvedMode,
      daily_used: toSafeInt(usage?.daily_used),
      daily_cap: toSafeInt(usage?.daily_cap),
      monthly_used: toSafeInt(usage?.monthly_used),
      monthly_cap: toSafeInt(usage?.monthly_cap),
    });
    setPaywallVisible(false);
    return true;
  };

  const refreshQuotaState = async ({ forceRefresh = true } = {}) => {
    const usage = await setQuotaModalUsage({ forceRefresh });
    return {
      usage,
      noAccess: hasNoCreditsAccess(usage),
      exceeded: isQuotaExceeded(usage),
    };
  };

  const closeQuotaModal = () => {
    quotaModal.close();
  };

  quotaModal.node.addEventListener("quota-modal:open", () => {
    container.classList.add("is-quota-modal-open");
  });

  quotaModal.node.addEventListener("quota-modal:close", () => {
    container.classList.remove("is-quota-modal-open");
  });

  const buildSendContext = (contextOverrides = null) => {
    const normalizedOverrides = isObject(contextOverrides) ? contextOverrides : {};
    const selectedBotIds = normalizeSelectedBotIds(
      Array.isArray(normalizedOverrides.selectedBotIds)
        ? normalizedOverrides.selectedBotIds
        : botContextPicker.getSelectedBotIds()
    );
    const contextKey = getContextKey(selectedBotIds);
    const resolvedConversationId =
      Object.prototype.hasOwnProperty.call(normalizedOverrides, "conversationId")
        ? normalizedOverrides.conversationId || null
        : conversationsByContext.get(contextKey) || null;
    const chatMode = normalizeChatMode(normalizedOverrides.chatMode ?? modePicker.getMode());
    const activeBotId = selectedBotIds.length === 1 ? selectedBotIds[0] : null;

    return {
      selectedBotIds,
      contextKey,
      conversationId: resolvedConversationId,
      chatMode,
      activeBotId,
    };
  };

  const toRetryPayload = ({ text, sendContext }) => ({
    text,
    selectedBotIds: sendContext.selectedBotIds,
    chatMode: sendContext.chatMode,
    conversationId: sendContext.conversationId,
  });

  const getSendDedupKey = ({ text, sendContext }) =>
    `${sendContext.contextKey}::${sendContext.conversationId || "new"}::${sendContext.chatMode}::${text}`;

  const clearInflightRequest = (requestState) => {
    if (!requestState || typeof requestState !== "object") return;
    inflightRequestsById.delete(requestState.requestId);
    const keyOwnerId = inflightRequestIdByKey.get(requestState.dedupKey);
    if (keyOwnerId === requestState.requestId) {
      inflightRequestIdByKey.delete(requestState.dedupKey);
    }
  };

  const cancelInflightRequest = (requestState) => {
    if (!requestState || typeof requestState !== "object" || requestState.canceled) return;
    requestState.canceled = true;
    clearInflightRequest(requestState);
    agentDockStore.removeMessage(requestState.optimisticMessageId);
  };

  const executeSendMessage = async ({ text, sendContext, clientRequestId, isCanceled }) => {
    try {
      const access = await getAiFeatureAccess();
      if (!access.allowed) {
        if (isCanceled()) return { accepted: false, reason: "canceled" };
        const reason = access.reason || PAYWALL_REASON_AI_LOCKED;
        setPaywallVisible(true, reason);
        closeQuotaModal();
        agentDockStore.addMessage({
          role: "assistant",
          content: PAYWALL_COPY[reason]?.assistant || PAYWALL_COPY[PAYWALL_REASON_AI_LOCKED].assistant,
        });
        return { accepted: false, reason: "blocked" };
      }

      const userId = window.DaVeriAuth?.session?.user?.id || null;
      if (typeof userId !== "string" || !userId.trim()) {
        if (isCanceled()) return { accepted: false, reason: "canceled" };
        setPaywallVisible(true, PAYWALL_REASON_AUTH);
        closeQuotaModal();
        agentDockStore.addMessage({
          role: "assistant",
          content: PAYWALL_COPY[PAYWALL_REASON_AUTH].assistant,
        });
        return { accepted: false, reason: "blocked" };
      }

      const cachedUsage = extractCreditUsage(getAgentCreditStatusSnapshot()?.data);
      const currentPlanId = getCurrentPlanId();
      const noAccessByCaps = hasNoCreditsAccess(cachedUsage);
      if (noAccessByCaps && !isPaidPlanId(currentPlanId)) {
        await openQuotaModal({ forceRefresh: true, mode: "no_access" });
        return { accepted: false, reason: "no_access" };
      }

      const rpcMeta = {
        selected_bot_ids: sendContext.selectedBotIds,
        mode: sendContext.chatMode,
        client_request_id: clientRequestId,
      };

      const sendResult = await sendMessageCreditLimited({
        conversationId: sendContext.conversationId,
        role: "user",
        content: text,
        meta: rpcMeta,
        activeBotId: sendContext.activeBotId,
        modeDefault: sendContext.chatMode,
      });

      if (isCanceled()) {
        return { accepted: false, reason: "canceled" };
      }

      if (!sendResult || !sendResult.message_id) {
        const quotaState = await refreshQuotaState({ forceRefresh: true });
        const currentPlanId = getCurrentPlanId();
        const hasPaidPlan = isPaidPlanId(currentPlanId);
        if (quotaState.noAccess && hasPaidPlan) {
          return {
            accepted: false,
            reason: "send_error",
            retryPayload: toRetryPayload({ text, sendContext }),
          };
        }
        if (quotaState.noAccess || quotaState.exceeded) {
          await openQuotaModal({
            forceRefresh: false,
            mode: quotaState.noAccess ? "no_access" : "quota_exceeded",
          });
          return { accepted: false, reason: "quota" };
        }

        return {
          accepted: false,
          reason: "send_error",
          retryPayload: toRetryPayload({ text, sendContext }),
        };
      }

      if (typeof sendResult.conversation_id === "string" && sendResult.conversation_id) {
        conversationsByContext.set(sendContext.contextKey, sendResult.conversation_id);
      }

      creditHud.applyUsageSnapshot(sendResult);
      closeQuotaModal();
      setPaywallVisible(false);

      if (!isCanceled()) {
        const askBotId = sendContext.activeBotId || sendContext.selectedBotIds[0] || getActiveBotId();
        try {
          if (!askBotId) {
            throw new Error("No bot selected for response generation");
          }

          const answer = await askAssistant(askBotId, text, sendContext.selectedBotIds);
          if (!isCanceled()) {
            agentDockStore.addMessage({
              role: "assistant",
              content: answer || "I could not generate a response right now.",
            });
          }
        } catch (error) {
          console.error("[AIWindow] ask failed", error);
          if (!isCanceled()) {
            agentDockStore.addMessage({
              role: "assistant",
              content: "The assistant is temporarily unavailable. Your message was received.",
            });
          }
        }
      }

      void refreshCreditStatus({ force: true });

      return { accepted: true, sendResult };
    } catch (error) {
      if (isCanceled()) {
        return { accepted: false, reason: "canceled" };
      }

      const message = String(error?.message || "").toLowerCase();
      console.error("[AIWindow] send failed", error);

      if (message.includes("auth") || message.includes("jwt") || message.includes("not authenticated")) {
        closeQuotaModal();
        setPaywallVisible(true, PAYWALL_REASON_AUTH);
        agentDockStore.addMessage({
          role: "assistant",
          content: PAYWALL_COPY[PAYWALL_REASON_AUTH].assistant,
        });
        return { accepted: false, reason: "blocked" };
      }

      if (message.includes("credit") || message.includes("quota") || message.includes("limit")) {
        const quotaState = await refreshQuotaState({ forceRefresh: true });
        const currentPlanId = getCurrentPlanId();
        const hasPaidPlan = isPaidPlanId(currentPlanId);
        if (quotaState.noAccess && hasPaidPlan) {
          return {
            accepted: false,
            reason: "send_error",
            retryPayload: toRetryPayload({ text, sendContext }),
          };
        }
        if (quotaState.noAccess || quotaState.exceeded) {
          await openQuotaModal({
            forceRefresh: false,
            mode: quotaState.noAccess ? "no_access" : "quota_exceeded",
          });
          return { accepted: false, reason: "quota" };
        }
      }

      return {
        accepted: false,
        reason: "send_error",
        retryPayload: toRetryPayload({ text, sendContext }),
      };
    }
  };

  const setOptimisticFailed = (requestState, retryPayload) => {
    agentDockStore.updateMessage(requestState.optimisticMessageId, {
      status: "failed",
      action: {
        type: RETRY_SEND_ACTION,
        label: "Retry",
        payload: {
          text: retryPayload.text,
          selectedBotIds: normalizeSelectedBotIds(retryPayload.selectedBotIds),
          chatMode: normalizeChatMode(retryPayload.chatMode),
          conversationId:
            typeof retryPayload.conversationId === "string" && retryPayload.conversationId
              ? retryPayload.conversationId
              : null,
        },
      },
    });
  };

  const finalizeOptimisticSuccess = (requestState, sendResult) => {
    const createdAt = Date.parse(sendResult?.message_created_at || "");
    agentDockStore.updateMessage(requestState.optimisticMessageId, {
      status: "sent",
      action: null,
      ts: Number.isFinite(createdAt) ? createdAt : Date.now(),
    });
  };

  const startSendRequest = (content, contextOverrides = null) => {
    const text = String(content || "").trim();
    if (!text) return { accepted: false };

    const sendContext = buildSendContext(contextOverrides);
    const dedupKey = getSendDedupKey({ text, sendContext });
    const existingRequestId = inflightRequestIdByKey.get(dedupKey);
    if (existingRequestId && inflightRequestsById.has(existingRequestId)) {
      showSendToast("This message is already sending.");
      return { accepted: false, reason: "duplicate" };
    }

    const requestId = createClientRequestId();
    const requestState = {
      requestId,
      dedupKey,
      text,
      sendContext,
      optimisticMessageId: `optimistic_${requestId}`,
      canceled: false,
    };

    inflightRequestsById.set(requestId, requestState);
    inflightRequestIdByKey.set(dedupKey, requestId);

    agentDockStore.addMessage({
      id: requestState.optimisticMessageId,
      role: "user",
      content: text,
      status: "sending",
      action: {
        type: CANCEL_SEND_ACTION,
        label: "Cancel",
        payload: {
          request_id: requestId,
        },
      },
    });

    void (async () => {
      const result = await executeSendMessage({
        text,
        sendContext,
        clientRequestId: requestId,
        isCanceled: () => Boolean(requestState.canceled),
      });

      if (requestState.canceled || result?.reason === "canceled") {
        return;
      }

      if (result?.accepted && result.sendResult) {
        finalizeOptimisticSuccess(requestState, result.sendResult);
        return;
      }

      if (result?.reason === "quota") {
        agentDockStore.removeMessage(requestState.optimisticMessageId);
        return;
      }

      if (result?.reason === "send_error" && isObject(result.retryPayload)) {
        showSendToast("Network/server error. Use Retry in the thread.");
        setOptimisticFailed(requestState, result.retryPayload);
        return;
      }

      agentDockStore.removeMessage(requestState.optimisticMessageId);
    })().finally(() => {
      clearInflightRequest(requestState);
    });

    return { accepted: true };
  };

  const input = createAIInput({
    onActivate: () => {
      agentDockStore.setExpanded(true);
    },
    onSend: (content) => startSendRequest(content),
  });

  const contextLine = document.createElement("div");
  contextLine.className = "ai-context-line";
  const updateContextLine = () => {
    contextLine.textContent = `Context: ${botContextPicker.getContextText()}`;
  };
  updateContextLine();
  botContextPicker.subscribe(updateContextLine);

  const composer = document.createElement("div");
  composer.className = "ai-composer";
  composer.appendChild(contextLine);
  composer.appendChild(input.node);

  const modeToast = document.createElement("div");
  modeToast.className = "ai-mode-toast";
  modeToast.hidden = true;
  container.appendChild(modeToast);

  const sendToast = document.createElement("div");
  sendToast.className = "ai-send-toast";
  sendToast.hidden = true;
  container.appendChild(sendToast);

  let toastTimer = null;
  let sendToastTimer = null;
  const showModeToast = (label) => {
    modeToast.textContent = `Mode set to ${label}`;
    modeToast.hidden = false;
    modeToast.classList.add("is-visible");
    if (toastTimer) {
      window.clearTimeout(toastTimer);
      toastTimer = null;
    }
    toastTimer = window.setTimeout(() => {
      modeToast.classList.remove("is-visible");
      window.setTimeout(() => {
        modeToast.hidden = true;
      }, 170);
    }, 1450);
  };

  const showSendToast = (text) => {
    sendToast.textContent = text;
    sendToast.hidden = false;
    sendToast.classList.add("is-visible");
    if (sendToastTimer) {
      window.clearTimeout(sendToastTimer);
      sendToastTimer = null;
    }
    sendToastTimer = window.setTimeout(() => {
      sendToast.classList.remove("is-visible");
      window.setTimeout(() => {
        sendToast.hidden = true;
      }, 170);
    }, 2200);
  };

  handleRetryAction = (event) => {
    if (!isObject(event) || !isObject(event.action)) return;
    const actionType = String(event.action.type || "").trim();

    if (actionType === CANCEL_SEND_ACTION) {
      const payload = isObject(event.action.payload) ? event.action.payload : {};
      const requestId = typeof payload.request_id === "string" ? payload.request_id : "";
      const requestState = requestId ? inflightRequestsById.get(requestId) : null;
      if (requestState) {
        cancelInflightRequest(requestState);
      } else if (typeof event?.message?.id === "string") {
        agentDockStore.removeMessage(event.message.id);
      }
      return;
    }

    if (actionType !== RETRY_SEND_ACTION) return;

    const messageId = typeof event?.message?.id === "string" ? event.message.id : "";
    if (messageId) {
      agentDockStore.removeMessage(messageId);
    }

    const retryPayload = isObject(event.action.payload) ? event.action.payload : {};
    const retryText = typeof retryPayload.text === "string" ? retryPayload.text.trim() : "";
    if (!retryText) return;

    const contextOverrides = {
      selectedBotIds: normalizeSelectedBotIds(retryPayload.selectedBotIds),
      chatMode: normalizeChatMode(retryPayload.chatMode),
      conversationId:
        typeof retryPayload.conversationId === "string" && retryPayload.conversationId
          ? retryPayload.conversationId
          : null,
    };

    startSendRequest(retryText, contextOverrides);
  };

  applyChatModeToUi(container, modePicker.getMode());
  modePicker.subscribe((event) => {
    applyChatModeToUi(container, event?.mode || "advisor");
    if (event?.source === "user") {
      showModeToast(event.label || "Read only");
    }
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
    trackEvent("upgrade_clicked", {
      source: "paywall",
      reason: paywallReason,
    });
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
  container.appendChild(chatHeader);
  container.appendChild(messagesWrap);
  container.appendChild(composer);
  container.appendChild(footer);
  container.appendChild(paywall);
  container.appendChild(quotaModal.node);
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
      if (quotaModal.isOpen()) {
        closeQuotaModal();
      }
    }
  });

  const sync = (state) => {
    if (!state.isExpanded && paywallVisible) {
      setPaywallVisible(false);
    }
    if (!state.isExpanded && quotaModal.isOpen()) {
      closeQuotaModal();
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
