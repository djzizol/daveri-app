const API_BASE = "/api/bots";

let onReloadBots = () => {};
let activeBot = null;

const getEditModal = () => document.getElementById("edit-bot-modal");

const closeEditBotModal = () => {
  const modal = getEditModal();
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
};

const getJsonError = async (response) => {
  try {
    const payload = await response.json();
    return payload?.error || payload?.message || JSON.stringify(payload);
  } catch {
    return await response.text();
  }
};

const botToExport = (bot) => ({
  id: bot.id,
  name: bot.name,
  preset: bot.preset,
  enabled: !!bot.enabled,
});

const syncEditFields = (bot) => {
  const nameInput = document.getElementById("edit-bot-name");
  const enabledInput = document.getElementById("edit-bot-enabled");
  const presetLabel = document.getElementById("edit-bot-preset");
  const idLabel = document.getElementById("edit-bot-id");

  if (nameInput) nameInput.value = bot?.name || "";
  if (enabledInput) enabledInput.checked = !!bot?.enabled;
  if (presetLabel) presetLabel.textContent = bot?.preset || "-";
  if (idLabel) idLabel.textContent = bot?.id || "-";
};

const saveBot = async () => {
  if (!activeBot?.id) return;
  const nameInput = document.getElementById("edit-bot-name");
  const enabledInput = document.getElementById("edit-bot-enabled");
  if (!nameInput || !enabledInput) return;

  const name = (nameInput.value || "").trim();
  if (!name) {
    nameInput.focus();
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/${activeBot.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, enabled: !!enabledInput.checked }),
    });

    if (!response.ok) {
      const details = await getJsonError(response);
      console.error("[EditBot] Save failed:", details);
      return;
    }

    closeEditBotModal();
    await onReloadBots();
  } catch (error) {
    console.error("[EditBot] Save request failed:", error);
  }
};

const cloneBot = async () => {
  if (!activeBot) return;
  try {
    const response = await fetch(API_BASE, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${activeBot.name || "Bot"} (copy)`,
        preset: activeBot.preset || "support",
        enabled: !!activeBot.enabled,
      }),
    });

    if (!response.ok) {
      const details = await getJsonError(response);
      console.error("[EditBot] Clone failed:", details);
      return;
    }

    await onReloadBots();
  } catch (error) {
    console.error("[EditBot] Clone request failed:", error);
  }
};

const deleteBot = async () => {
  if (!activeBot?.id) return;
  const confirmed = window.confirm("Delete this bot?");
  if (!confirmed) return;

  try {
    const response = await fetch(`${API_BASE}/${activeBot.id}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!response.ok) {
      const details = await getJsonError(response);
      console.error("[EditBot] Delete failed:", details);
      return;
    }

    closeEditBotModal();
    await onReloadBots();
  } catch (error) {
    console.error("[EditBot] Delete request failed:", error);
  }
};

const copyBotId = async () => {
  if (!activeBot?.id) return;
  try {
    await navigator.clipboard.writeText(activeBot.id);
  } catch (error) {
    console.error("[EditBot] Copy id failed:", error);
  }
};

const downloadBotJson = () => {
  if (!activeBot) return;
  const data = JSON.stringify(botToExport(activeBot), null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(activeBot.name || "bot").replace(/\s+/g, "-").toLowerCase()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const wireActions = () => {
  document.getElementById("edit-bot-save")?.addEventListener("click", saveBot);
  document.getElementById("edit-bot-clone")?.addEventListener("click", cloneBot);
  document.getElementById("edit-bot-delete")?.addEventListener("click", deleteBot);
  document.getElementById("edit-bot-copy-id")?.addEventListener("click", copyBotId);
  document.getElementById("edit-bot-download")?.addEventListener("click", downloadBotJson);
};

const openEditBotModal = (bot) => {
  if (!bot) return;
  activeBot = { ...bot };
  syncEditFields(activeBot);
  const modal = getEditModal();
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add("modal-open");
};

export const initEditBotModal = (options = {}) => {
  onReloadBots = typeof options.onReloadBots === "function" ? options.onReloadBots : () => {};
  const modal = getEditModal();
  if (!modal) return;

  wireActions();
  modal.querySelectorAll("[data-modal-close='edit-bot-modal']").forEach((btn) => {
    btn.addEventListener("click", closeEditBotModal);
  });
};

export { closeEditBotModal, openEditBotModal };
