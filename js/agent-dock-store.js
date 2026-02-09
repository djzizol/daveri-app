const AGENT_DOCK_STORAGE_KEY = "daveri_agent_dock_state_v1";

const DEFAULT_STATE = {
  messages: [
    {
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

const loadFromStorage = () => {
  try {
    const raw = sessionStorage.getItem(AGENT_DOCK_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    const messages = Array.isArray(parsed?.messages) ? parsed.messages.slice(-100) : DEFAULT_STATE.messages;
    return {
      messages,
      isExpanded: parsed?.isExpanded !== false,
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
      const next = {
        role: message?.role === "user" ? "user" : "assistant",
        content: String(message?.content || "").trim(),
        ts: Number(message?.ts) || Date.now(),
      };
      if (!next.content) return;
      state = { ...state, messages: [...state.messages, next].slice(-100) };
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
