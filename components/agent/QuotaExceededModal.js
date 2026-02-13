import { trackEvent } from "../../js/analytics.js";

const toSafeInt = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
};

const normalizeUsage = (usage) => ({
  daily_used: toSafeInt(usage?.daily_used),
  daily_cap: toSafeInt(usage?.daily_cap),
  monthly_used: toSafeInt(usage?.monthly_used),
  monthly_cap: toSafeInt(usage?.monthly_cap),
});

export const createQuotaExceededModal = ({ onRefreshStatus } = {}) => {
  let currentUsage = normalizeUsage(null);
  let modalMode = "quota_exceeded";

  const root = document.createElement("div");
  root.className = "ai-quota-modal";
  root.hidden = true;
  root.innerHTML = `
    <div class="ai-quota-modal-card" role="dialog" aria-modal="true" aria-labelledby="aiQuotaTitle">
      <h3 id="aiQuotaTitle" data-role="title">Limit kredytow wyczerpany</h3>
      <p class="ai-quota-modal-subtitle" data-role="subtitle">Nie mozemy wyslac wiadomosci, bo przekroczono quota.</p>
      <div class="ai-quota-modal-usage">
        <div class="ai-quota-modal-row">
          <span>Dzisiaj:</span>
          <strong data-role="daily">0 / 0</strong>
        </div>
        <div class="ai-quota-modal-row">
          <span>Miesiac:</span>
          <strong data-role="monthly">0 / 0</strong>
        </div>
      </div>
      <div class="ai-quota-modal-resets">
        <div>Reset dzienny: limity odswiezaja sie codziennie.</div>
        <div>Reset miesieczny: limity odswiezaja sie co miesiac.</div>
      </div>
      <div class="ai-quota-modal-actions">
        <a class="ai-quota-modal-btn is-primary" href="#upgrade-plan" data-role="primary-link">Upgrade plan</a>
        <a class="ai-quota-modal-btn" href="#buy-credits" data-role="secondary-link">Dokup kredyty</a>
        <button type="button" class="ai-quota-modal-btn" data-role="refresh">Refresh</button>
        <button type="button" class="ai-quota-modal-btn" data-role="close">Close</button>
      </div>
    </div>
  `;

  const dailyNode = root.querySelector("[data-role='daily']");
  const monthlyNode = root.querySelector("[data-role='monthly']");
  const titleNode = root.querySelector("[data-role='title']");
  const subtitleNode = root.querySelector("[data-role='subtitle']");
  const primaryLink = root.querySelector("[data-role='primary-link']");
  const secondaryLink = root.querySelector("[data-role='secondary-link']");
  const refreshButton = root.querySelector("[data-role='refresh']");
  const closeButton = root.querySelector("[data-role='close']");

  const applyMode = () => {
    const noAccess = modalMode === "no_access";

    if (titleNode) {
      titleNode.textContent = noAccess ? "Brak dostepu do kredytow AI" : "Limit kredytow wyczerpany";
    }
    if (subtitleNode) {
      subtitleNode.textContent = noAccess
        ? "Wybierz plan, aby aktywowac kredyty i rozpoczac wysylanie wiadomosci."
        : "Nie mozemy wyslac wiadomosci, bo przekroczono quota.";
    }
    if (primaryLink) {
      primaryLink.textContent = noAccess ? "Wybierz plan" : "Upgrade plan";
      primaryLink.setAttribute("href", noAccess ? "#choose-plan" : "#upgrade-plan");
    }
    if (secondaryLink) {
      secondaryLink.hidden = noAccess;
    }
  };

  const render = () => {
    if (dailyNode) {
      dailyNode.textContent = `${currentUsage.daily_used} / ${currentUsage.daily_cap}`;
    }
    if (monthlyNode) {
      monthlyNode.textContent = `${currentUsage.monthly_used} / ${currentUsage.monthly_cap}`;
    }
  };

  const setUsage = (usage) => {
    currentUsage = normalizeUsage(usage);
    render();
  };

  const setMode = (mode) => {
    modalMode = mode === "no_access" ? "no_access" : "quota_exceeded";
    root.dataset.mode = modalMode;
    applyMode();
  };

  const open = (usage, options = {}) => {
    setMode(options?.mode);
    setUsage(usage);
    root.hidden = false;
    root.classList.add("is-open");
    root.dispatchEvent(new CustomEvent("quota-modal:open"));
  };

  const close = () => {
    root.classList.remove("is-open");
    root.hidden = true;
    root.dispatchEvent(new CustomEvent("quota-modal:close"));
  };

  refreshButton?.addEventListener("click", async () => {
    if (typeof onRefreshStatus !== "function") return;
    refreshButton.disabled = true;
    try {
      const usage = await onRefreshStatus();
      if (usage) setUsage(usage);
    } finally {
      refreshButton.disabled = false;
    }
  });

  primaryLink?.addEventListener("click", () => {
    trackEvent("upgrade_clicked", {
      source: "quota_modal",
      mode: modalMode,
    });
  });

  closeButton?.addEventListener("click", close);
  root.addEventListener("click", (event) => {
    if (event.target === root) close();
  });

  applyMode();
  render();

  return {
    node: root,
    open,
    close,
    isOpen: () => !root.hidden,
    setUsage,
    setMode,
  };
};
