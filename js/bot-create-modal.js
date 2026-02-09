import { getApiUrl } from "./api.js";
import { setActiveBotId } from "./active-bot.js";

const API_BASE = getApiUrl("/api/bots");

let onReloadBots = () => {};
let selectedPreset = "support";

const getCreateModal = () => document.getElementById("create-bot-modal");

const getCreateStatusEl = () => document.getElementById("create-bot-status");

const setCreateStatus = (message, type = "info") => {
  const statusEl = getCreateStatusEl();
  if (!statusEl) return;
  statusEl.textContent = message || "";
  statusEl.style.color = type === "error" ? "#fca5a5" : "var(--dv-muted)";
};

const closeCreateModal = () => {
  const modal = getCreateModal();
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
  setCreateStatus("");
};

const openCreateModal = () => {
  const modal = getCreateModal();
  if (!modal) return;
  const nameInput = document.getElementById("create-bot-name");
  const enabledInput = document.getElementById("create-bot-enabled");
  selectedPreset = "support";
  modal.querySelectorAll(".preset-card").forEach((card) => {
    card.classList.toggle("selected", card.dataset.preset === "support");
  });
  if (nameInput) nameInput.value = "";
  if (enabledInput) enabledInput.checked = true;
  setCreateStatus("Appearance and widget settings can be configured later in the Appearance tab.");
  modal.hidden = false;
  document.body.classList.add("modal-open");
};

const getJsonError = async (response) => {
  try {
    const payload = await response.json();
    return payload?.error || payload?.message || JSON.stringify(payload);
  } catch {
    return await response.text();
  }
};

const bindPresetPicker = (modal) => {
  modal.querySelectorAll(".preset-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectedPreset = card.dataset.preset || "support";
      modal.querySelectorAll(".preset-card").forEach((el) => el.classList.remove("selected"));
      card.classList.add("selected");
    });
  });
};

const submitCreateBot = async () => {
  const nameInput = document.getElementById("create-bot-name");
  const enabledInput = document.getElementById("create-bot-enabled");
  if (!nameInput || !enabledInput) return;

  const name = (nameInput.value || "").trim();
  if (!name) {
    nameInput.focus();
    return;
  }

  try {
    const submitBtn = document.getElementById("create-bot-submit");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Creating...";
    }
    setCreateStatus("");

    const response = await fetch(API_BASE, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        preset: selectedPreset,
        enabled: !!enabledInput.checked,
      }),
    });

    if (!response.ok) {
      const details = await getJsonError(response);
      console.error("[CreateBot] API failed:", details);
      setCreateStatus("Could not create bot. Check console / API response.", "error");
      return;
    }

    let created = null;
    try {
      created = await response.json();
    } catch {
      created = null;
    }
    if (created?.id) {
      setActiveBotId(created.id);
    }

    closeCreateModal();
    await onReloadBots();
  } catch (error) {
    console.error("[CreateBot] Request failed:", error);
    setCreateStatus("Network/API error while creating bot.", "error");
  } finally {
    const submitBtn = document.getElementById("create-bot-submit");
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Create Bot";
    }
  }
};

export const initCreateBotModal = (options = {}) => {
  onReloadBots = typeof options.onReloadBots === "function" ? options.onReloadBots : () => {};
  const modal = getCreateModal();
  if (!modal) return;

  const submitBtn = document.getElementById("create-bot-submit");
  const nameInput = document.getElementById("create-bot-name");
  const enabledInput = document.getElementById("create-bot-enabled");

  selectedPreset = "support";
  bindPresetPicker(modal);

  submitBtn?.addEventListener("click", submitCreateBot);
  nameInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitCreateBot();
    }
  });

  modal.querySelectorAll("[data-modal-close='create-bot-modal']").forEach((btn) => {
    btn.addEventListener("click", closeCreateModal);
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeCreateModal();
  });

  enabledInput.checked = true;
};

export { closeCreateModal, openCreateModal };
