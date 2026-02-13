const MODE_STORAGE_PREFIX = "daveri_agent_chat_mode_v1";
const MODE_ADVISOR = "advisor";
const MODE_OPERATOR = "operator";

const MODE_DEFINITIONS = [
  {
    value: MODE_OPERATOR,
    label: "Full access",
    description: "Agent moze wykonywac akcje (np. tworzyc/edytowac), jesli potwierdzisz.",
  },
  {
    value: MODE_ADVISOR,
    label: "Read only",
    description: "Agent tylko analizuje i proponuje, bez wykonywania zmian.",
  },
];

const resolveCurrentUserId = () => {
  const fromAuth = window?.DaVeriAuth?.session?.user?.id;
  if (typeof fromAuth === "string" && fromAuth.trim()) return fromAuth.trim();

  const fromSidebar = document.getElementById("daveri_sidebar")?.dataset?.userId;
  if (typeof fromSidebar === "string" && fromSidebar.trim()) return fromSidebar.trim();

  return "guest";
};

const getStorageKey = () => `${MODE_STORAGE_PREFIX}:${resolveCurrentUserId()}`;

const normalizeMode = (value) => {
  if (value === MODE_OPERATOR) return MODE_OPERATOR;
  return MODE_ADVISOR;
};

const readStoredMode = () => {
  try {
    const raw = window.localStorage.getItem(getStorageKey());
    if (!raw) return MODE_ADVISOR;
    return normalizeMode(raw.trim().toLowerCase());
  } catch {
    return MODE_ADVISOR;
  }
};

const writeStoredMode = (mode) => {
  try {
    window.localStorage.setItem(getStorageKey(), normalizeMode(mode));
  } catch {}
};

const getModeLabel = (mode) =>
  MODE_DEFINITIONS.find((item) => item.value === mode)?.label || "Read only";

export const createModePicker = () => {
  const listeners = new Set();
  const buttons = new Map();
  let mode = readStoredMode();

  const root = document.createElement("div");
  root.className = "ai-mode-picker";

  const emit = (source) => {
    const payload = {
      mode,
      source,
      label: getModeLabel(mode),
    };
    listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch {}
    });
  };

  const syncUi = () => {
    MODE_DEFINITIONS.forEach((definition) => {
      const button = buttons.get(definition.value);
      if (!button) return;
      const active = definition.value === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  };

  const setMode = (nextMode, { source = "programmatic", persist = true } = {}) => {
    const normalized = normalizeMode(nextMode);
    if (mode === normalized && source !== "init") return;
    mode = normalized;
    if (persist) {
      writeStoredMode(mode);
    }
    syncUi();
    emit(source);
  };

  MODE_DEFINITIONS.forEach((definition) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ai-mode-chip";
    button.dataset.mode = definition.value;
    button.textContent = definition.label;
    button.title = definition.description;
    button.setAttribute("aria-label", definition.label);
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      setMode(definition.value, { source: "user", persist: true });
    });
    buttons.set(definition.value, button);
    root.appendChild(button);
  });

  setMode(mode, { source: "init", persist: false });

  document.addEventListener("auth:ready", () => {
    const storedMode = readStoredMode();
    setMode(storedMode, { source: "auth-sync", persist: false });
  });

  return {
    node: root,
    getMode: () => mode,
    getModeLabel: () => getModeLabel(mode),
    setMode: (nextMode, options = {}) => setMode(nextMode, options),
    subscribe: (listener) => {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
