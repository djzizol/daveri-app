import { getApiUrl } from "./api.js";

const API_BASE = getApiUrl("/api/bots");

let onReloadBots = () => {};
let selectedPreset = "support";

const getCreateModal = () => document.getElementById("create-bot-modal");

const closeCreateModal = () => {
  const modal = getCreateModal();
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
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
      return;
    }

    closeCreateModal();
    await onReloadBots();
  } catch (error) {
    console.error("[CreateBot] Request failed:", error);
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
