import { apiFetch, getApiUrl } from "../../js/api.js";
import { getActiveBotId } from "../../js/active-bot.js";

const API_BOTS = getApiUrl("/api/bots");
const BOT_ICON_URL = "/icons/default-bot.svg";
const BOT_CONTEXT_STORAGE_KEY = "daveri_agent_selected_bot_ids_v1";

const normalizeBotsPayload = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.bots)) return payload.bots;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const normalizeBotRecord = (record) => {
  const id = typeof record?.id === "string" ? record.id.trim() : "";
  if (!id) return null;

  const name =
    (typeof record?.name === "string" && record.name.trim()) ||
    (typeof record?.title === "string" && record.title.trim()) ||
    "Unnamed Bot";

  const avatar =
    (typeof record?.icon_url === "string" && record.icon_url.trim()) ||
    (typeof record?.avatar === "string" && record.avatar.trim()) ||
    BOT_ICON_URL;

  return { id, name, avatar };
};

const readStoredSelection = () => {
  try {
    const raw = window.localStorage.getItem(BOT_CONTEXT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  } catch {
    return [];
  }
};

const writeStoredSelection = (selectedIds) => {
  try {
    window.localStorage.setItem(BOT_CONTEXT_STORAGE_KEY, JSON.stringify(selectedIds));
  } catch {}
};

export const createBotContextPicker = ({ maxSelected = 3 } = {}) => {
  const maxCount = Math.max(1, Number(maxSelected) || 3);
  const listeners = new Set();

  let bots = [];
  let selectedIds = readStoredSelection();
  let searchQuery = "";
  let loading = false;
  let errorMessage = "";
  let isOpen = false;

  const root = document.createElement("div");
  root.className = "ai-bot-context-picker";

  const chipsRow = document.createElement("div");
  chipsRow.className = "ai-bot-chips-row";

  const addChip = document.createElement("button");
  addChip.type = "button";
  addChip.className = "ai-bot-chip ai-bot-chip-add";
  addChip.textContent = "+ Bot";
  addChip.setAttribute("aria-label", "Add bot to context");

  const dropdown = document.createElement("div");
  dropdown.className = "ai-bot-dropdown";
  dropdown.hidden = true;

  const searchWrap = document.createElement("div");
  searchWrap.className = "ai-bot-dropdown-search-wrap";

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "ai-bot-dropdown-search";
  searchInput.placeholder = "Search bots...";
  searchInput.setAttribute("aria-label", "Search bots");

  const list = document.createElement("div");
  list.className = "ai-bot-dropdown-list";

  const meta = document.createElement("div");
  meta.className = "ai-bot-dropdown-meta";

  searchWrap.appendChild(searchInput);
  dropdown.appendChild(searchWrap);
  dropdown.appendChild(list);
  dropdown.appendChild(meta);

  root.appendChild(chipsRow);
  root.appendChild(dropdown);

  const getSelectedBots = () => {
    const byId = new Map(bots.map((bot) => [bot.id, bot]));
    return selectedIds.map((id) => byId.get(id)).filter(Boolean);
  };

  const emit = () => {
    const selectedBots = getSelectedBots();
    listeners.forEach((listener) => {
      try {
        listener({
          selectedBotIds: [...selectedIds],
          selectedBots,
        });
      } catch {}
    });
  };

  const ensureSelectionValid = () => {
    if (!bots.length) {
      selectedIds = selectedIds.slice(0, maxCount);
      writeStoredSelection(selectedIds);
      return;
    }

    const allowed = new Set(bots.map((bot) => bot.id));
    selectedIds = selectedIds.filter((id) => allowed.has(id)).slice(0, maxCount);
    writeStoredSelection(selectedIds);
  };

  const setOpen = (nextOpen) => {
    isOpen = Boolean(nextOpen);
    dropdown.hidden = !isOpen;
    root.classList.toggle("is-open", isOpen);
    if (isOpen) {
      window.setTimeout(() => searchInput.focus(), 0);
    }
  };

  const removeSelection = (botId) => {
    selectedIds = selectedIds.filter((id) => id !== botId);
    writeStoredSelection(selectedIds);
    renderChips();
    renderDropdown();
    emit();
  };

  const addSelection = (botId) => {
    if (!botId || selectedIds.includes(botId)) return;
    if (selectedIds.length >= maxCount) return;
    selectedIds = [...selectedIds, botId];
    writeStoredSelection(selectedIds);
    renderChips();
    renderDropdown();
    emit();
  };

  const toggleSelection = (botId) => {
    if (selectedIds.includes(botId)) {
      removeSelection(botId);
      return;
    }
    addSelection(botId);
  };

  const renderChips = () => {
    chipsRow.innerHTML = "";
    const selectedBots = getSelectedBots();

    selectedBots.forEach((bot) => {
      const chip = document.createElement("div");
      chip.className = "ai-bot-chip";

      const avatar = document.createElement("img");
      avatar.className = "ai-bot-chip-avatar";
      avatar.src = bot.avatar || BOT_ICON_URL;
      avatar.alt = "";
      avatar.decoding = "async";
      avatar.onerror = () => {
        avatar.onerror = null;
        avatar.src = BOT_ICON_URL;
      };

      const name = document.createElement("span");
      name.className = "ai-bot-chip-name";
      name.textContent = bot.name;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ai-bot-chip-remove";
      remove.setAttribute("aria-label", `Remove ${bot.name} from context`);
      remove.textContent = "x";
      remove.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeSelection(bot.id);
      });

      chip.appendChild(avatar);
      chip.appendChild(name);
      chip.appendChild(remove);
      chipsRow.appendChild(chip);
    });

    chipsRow.appendChild(addChip);
  };

  const renderDropdown = () => {
    list.innerHTML = "";

    if (loading) {
      const row = document.createElement("div");
      row.className = "ai-bot-dropdown-state";
      row.textContent = "Loading bots...";
      list.appendChild(row);
      meta.textContent = "";
      return;
    }

    if (errorMessage) {
      const row = document.createElement("div");
      row.className = "ai-bot-dropdown-state is-error";
      row.textContent = errorMessage;
      list.appendChild(row);
      meta.textContent = "Retry by reopening the picker.";
      return;
    }

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const visibleBots = bots.filter((bot) => bot.name.toLowerCase().includes(normalizedQuery));

    if (!visibleBots.length) {
      const row = document.createElement("div");
      row.className = "ai-bot-dropdown-state";
      row.textContent = "No bots found.";
      list.appendChild(row);
    } else {
      visibleBots.forEach((bot) => {
        const selected = selectedIds.includes(bot.id);
        const disabled = !selected && selectedIds.length >= maxCount;

        const row = document.createElement("button");
        row.type = "button";
        row.className = "ai-bot-dropdown-item";
        row.disabled = disabled;
        row.classList.toggle("is-selected", selected);

        const avatar = document.createElement("img");
        avatar.className = "ai-bot-dropdown-avatar";
        avatar.src = bot.avatar || BOT_ICON_URL;
        avatar.alt = "";
        avatar.decoding = "async";
        avatar.onerror = () => {
          avatar.onerror = null;
          avatar.src = BOT_ICON_URL;
        };

        const name = document.createElement("span");
        name.className = "ai-bot-dropdown-name";
        name.textContent = bot.name;

        const state = document.createElement("span");
        state.className = "ai-bot-dropdown-check";
        state.textContent = selected ? "Selected" : disabled ? "Limit" : "Add";

        row.appendChild(avatar);
        row.appendChild(name);
        row.appendChild(state);
        row.addEventListener("click", () => {
          toggleSelection(bot.id);
        });
        list.appendChild(row);
      });
    }

    const count = selectedIds.length;
    meta.textContent = `Selected: ${count}/${maxCount}`;
  };

  const render = () => {
    ensureSelectionValid();
    renderChips();
    renderDropdown();
  };

  const fetchBots = async () => {
    loading = true;
    errorMessage = "";
    renderDropdown();

    try {
      const response = await apiFetch(API_BOTS, {
        method: "GET",
      });
      if (!response.ok) {
        throw new Error(`Could not load bots (${response.status})`);
      }
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      bots = normalizeBotsPayload(payload).map(normalizeBotRecord).filter(Boolean);

      if (!selectedIds.length) {
        const defaultBotId = getActiveBotId();
        if (defaultBotId && bots.some((bot) => bot.id === defaultBotId)) {
          selectedIds = [defaultBotId];
        }
      }

      loading = false;
      errorMessage = "";
      render();
      emit();
    } catch (error) {
      loading = false;
      errorMessage = error?.message ? String(error.message) : "Could not load bots.";
      renderDropdown();
    }
  };

  const onDocumentClick = (event) => {
    if (!root.contains(event.target)) {
      setOpen(false);
    }
  };

  const onEscape = (event) => {
    if (event.key === "Escape") {
      setOpen(false);
    }
  };

  addChip.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(!isOpen);
    if (!bots.length && !loading) {
      void fetchBots();
    }
  });

  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value || "";
    renderDropdown();
  });

  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onEscape);

  render();
  void fetchBots();

  return {
    node: root,
    refreshBots: fetchBots,
    getSelectedBotIds: () => [...selectedIds],
    getContextText: () => {
      const selectedBots = getSelectedBots();
      if (!selectedBots.length) return "No bot selected";
      return selectedBots.map((bot) => bot.name).join(" + ");
    },
    subscribe: (listener) => {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy: () => {
      document.removeEventListener("click", onDocumentClick);
      document.removeEventListener("keydown", onEscape);
      listeners.clear();
    },
  };
};
