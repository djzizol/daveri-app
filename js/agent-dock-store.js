const AGENT_DOCK_STORAGE_KEY = "daveri_agent_dock_state_v1";
const MAX_MESSAGES = 100;

const DEFAULT_STATE = {
  messages: [
    {
      id: "welcome",
      role: "assistant",
      content: "Welcome back. Ask me to optimize your workspace or review your latest activity.",
      ts: Date.now(),
    },
  ],
  isExpanded: false,
  height: 420,
};

const clampHeight = (height) => {
  const numeric = Number(height);
  if (!Number.isFinite(numeric)) return DEFAULT_STATE.height;
  return Math.max(320, Math.min(560, Math.round(numeric)));
};

const createMessageId = () => {
  try {
    if (typeof crypto?.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {}
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
};

const normalizeRole = (value) => (value === "user" ? "user" : "assistant");
const normalizeStatus = (value) => {
  if (value === "sending") return "sending";
  if (value === "failed") return "failed";
  return "sent";
};

const normalizeAction = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const type = typeof value.type === "string" ? value.type.trim() : "";
  if (!type) return null;

  const label =
    typeof value.label === "string" && value.label.trim()
      ? value.label.trim()
      : "Retry";

  const payload = value.payload && typeof value.payload === "object" ? value.payload : null;

  return {
    type,
    label,
    payload,
  };
};

const normalizeMessage = (message) => {
  const content = String(message?.content || "").trim();
  if (!content) return null;

  const rawId = typeof message?.id === "string" ? message.id.trim() : "";

  return {
    id: rawId || createMessageId(),
    role: normalizeRole(message?.role),
    content,
    ts: Number(message?.ts) || Date.now(),
    status: normalizeStatus(message?.status),
    action: normalizeAction(message?.action),
  };
};

const loadFromStorage = () => {
  try {
    const raw = sessionStorage.getItem(AGENT_DOCK_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    const messages = Array.isArray(parsed?.messages)
      ? parsed.messages.map(normalizeMessage).filter(Boolean).slice(-MAX_MESSAGES)
      : DEFAULT_STATE.messages;
    return {
      messages,
      isExpanded: typeof parsed?.isExpanded === "boolean" ? parsed.isExpanded : DEFAULT_STATE.isExpanded,
      height: clampHeight(parsed?.height),
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
};

const createStore = () => {
  let state = loadFromStorage();
  const listeners = new Set();

  const persist = () => {
    try {
      sessionStorage.setItem(AGENT_DOCK_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // no-op
    }
  };

  const emit = () => {
    persist();
    listeners.forEach((listener) => listener(state));
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setExpanded: (isExpanded) => {
      state = { ...state, isExpanded: Boolean(isExpanded) };
      emit();
    },
    setHeight: (height) => {
      state = { ...state, height: clampHeight(height) };
      emit();
    },
    addMessage: (message) => {
      const next = normalizeMessage(message);
      if (!next || !next.content) return;
      state = { ...state, messages: [...state.messages, next].slice(-MAX_MESSAGES) };
      emit();
      return next.id;
    },
    updateMessage: (messageId, patch) => {
      if (typeof messageId !== "string" || !messageId.trim() || !patch || typeof patch !== "object") return false;
      const idx = state.messages.findIndex((message) => message.id === messageId);
      if (idx < 0) return false;

      const current = state.messages[idx];
      const hasOwn = (key) => Object.prototype.hasOwnProperty.call(patch, key);

      const nextContentRaw = hasOwn("content") ? String(patch.content || "").trim() : current.content;
      if (!nextContentRaw) return false;

      const nextMessage = {
        id: current.id,
        role: hasOwn("role") ? normalizeRole(patch.role) : current.role,
        content: nextContentRaw,
        ts: hasOwn("ts") && Number.isFinite(Number(patch.ts)) ? Number(patch.ts) : current.ts,
        status: hasOwn("status") ? normalizeStatus(patch.status) : normalizeStatus(current.status),
        action: hasOwn("action") ? normalizeAction(patch.action) : normalizeAction(current.action),
      };

      const nextMessages = [...state.messages];
      nextMessages[idx] = nextMessage;
      state = { ...state, messages: nextMessages };
      emit();
      return true;
    },
    removeMessage: (messageId) => {
      if (typeof messageId !== "string" || !messageId.trim()) return;
      const nextMessages = state.messages.filter((message) => message.id !== messageId);
      if (nextMessages.length === state.messages.length) return;
      state = { ...state, messages: nextMessages };
      emit();
    },
    reset: () => {
      state = { ...DEFAULT_STATE };
      emit();
    },
  };
};

const singleton = window.__DaVeriAgentDockStore || createStore();
window.__DaVeriAgentDockStore = singleton;

export const agentDockStore = singleton;
