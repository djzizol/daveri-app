import {
  applyAgentCreditUsageSnapshot,
  getAgentCreditStatusSnapshot,
  refreshAgentCreditStatus,
  subscribeAgentCreditStatus,
} from "../../js/agent-credit-status-store.js";

const RING_RADIUS = 14;
const RING_SIZE = 34;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const POLL_MS = 60_000;
const isObject = (value) => value && typeof value === "object";

const clamp01 = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

const toSafeInt = (value, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.floor(numeric));
};

const toCapOrUnlimited = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric <= 0) return null;
  return Math.floor(numeric);
};

const toPct = (used, cap) => {
  if (!Number.isFinite(cap) || cap <= 0) return null;
  return clamp01(used / cap);
};

const formatPct = (ratio) => `${(clamp01(Number.isFinite(ratio) ? ratio : 0) * 100).toFixed(1)}%`;

const formatUsageLine = (label, used, cap, ratio) =>
  cap === null ? `${label}: unlimited` : `${label}: ${used} / ${cap} (${formatPct(ratio)})`;

export const createCreditHUDRing = () => {
  const root = document.createElement("div");
  root.className = "ai-credit-hud";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "ai-credit-ring-trigger";
  trigger.setAttribute("aria-label", "Credit usage status");
  trigger.setAttribute("aria-haspopup", "dialog");

  const ringSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  ringSvg.setAttribute("viewBox", `0 0 ${RING_SIZE} ${RING_SIZE}`);
  ringSvg.setAttribute("class", "ai-credit-ring-svg");
  ringSvg.setAttribute("aria-hidden", "true");

  const track = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  track.setAttribute("class", "ai-credit-ring-track");
  track.setAttribute("cx", String(RING_SIZE / 2));
  track.setAttribute("cy", String(RING_SIZE / 2));
  track.setAttribute("r", String(RING_RADIUS));

  const progress = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  progress.setAttribute("class", "ai-credit-ring-progress");
  progress.setAttribute("cx", String(RING_SIZE / 2));
  progress.setAttribute("cy", String(RING_SIZE / 2));
  progress.setAttribute("r", String(RING_RADIUS));
  progress.style.strokeDasharray = `${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`;
  progress.style.strokeDashoffset = String(RING_CIRCUMFERENCE);

  ringSvg.appendChild(track);
  ringSvg.appendChild(progress);

  const centerLabel = document.createElement("span");
  centerLabel.className = "ai-credit-ring-center";
  centerLabel.textContent = "...";

  const warningBadge = document.createElement("span");
  warningBadge.className = "ai-credit-warning-badge";
  warningBadge.hidden = true;
  warningBadge.textContent = "!";

  trigger.appendChild(ringSvg);
  trigger.appendChild(centerLabel);
  trigger.appendChild(warningBadge);

  const tooltip = document.createElement("div");
  tooltip.className = "ai-credit-tooltip";
  tooltip.setAttribute("role", "dialog");
  tooltip.setAttribute("aria-label", "Credit usage details");

  const tooltipTitle = document.createElement("div");
  tooltipTitle.className = "ai-credit-tooltip-title";
  tooltipTitle.textContent = "Credit usage";

  const tooltipDaily = document.createElement("div");
  tooltipDaily.className = "ai-credit-tooltip-line";

  const tooltipMonthly = document.createElement("div");
  tooltipMonthly.className = "ai-credit-tooltip-line";

  const tooltipRemaining = document.createElement("div");
  tooltipRemaining.className = "ai-credit-tooltip-remaining";

  const tooltipError = document.createElement("div");
  tooltipError.className = "ai-credit-tooltip-error";
  tooltipError.hidden = true;

  const tooltipActions = document.createElement("div");
  tooltipActions.className = "ai-credit-tooltip-actions";

  const refreshButton = document.createElement("button");
  refreshButton.type = "button";
  refreshButton.className = "ai-credit-tooltip-refresh";
  refreshButton.textContent = "Refresh";

  const refreshToast = document.createElement("div");
  refreshToast.className = "ai-credit-toast";
  refreshToast.hidden = true;

  tooltipActions.appendChild(refreshButton);
  tooltip.appendChild(tooltipTitle);
  tooltip.appendChild(tooltipDaily);
  tooltip.appendChild(tooltipMonthly);
  tooltip.appendChild(tooltipRemaining);
  tooltip.appendChild(tooltipError);
  tooltip.appendChild(tooltipActions);

  root.appendChild(trigger);
  root.appendChild(tooltip);
  root.appendChild(refreshToast);

  let pinnedOpen = false;
  let toastTimer = null;

  const setPinnedOpen = (isOpen) => {
    pinnedOpen = Boolean(isOpen);
    root.classList.toggle("is-open", pinnedOpen);
  };

  const showRefreshToast = (message) => {
    refreshToast.textContent = String(message || "");
    refreshToast.hidden = false;
    refreshToast.classList.add("is-visible");
    if (toastTimer) {
      window.clearTimeout(toastTimer);
      toastTimer = null;
    }
    toastTimer = window.setTimeout(() => {
      refreshToast.classList.remove("is-visible");
      window.setTimeout(() => {
        refreshToast.hidden = true;
      }, 170);
    }, 1800);
  };

  const render = (snapshot) => {
    const isLoading = snapshot?.isLoading === true;
    const error = snapshot?.error || null;
    const hasData =
      isObject(snapshot) &&
      (typeof snapshot.day === "string" ||
        snapshot.daily_used !== null ||
        snapshot.daily_cap !== null ||
        snapshot.monthly_used !== null ||
        snapshot.monthly_cap !== null);

    root.classList.toggle("is-loading", isLoading);
    root.classList.toggle("is-error", Boolean(error) && !hasData);
    root.classList.remove("is-warning", "is-no-access", "is-unlimited");

    if (!hasData && isLoading) {
      centerLabel.textContent = "...";
      tooltipDaily.textContent = "Loading credits...";
      tooltipMonthly.textContent = "Loading credits...";
      tooltipRemaining.textContent = "Loading credits...";
      tooltipError.hidden = true;
      tooltipError.textContent = "";
      progress.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
      warningBadge.hidden = true;
      return;
    }

    if (!hasData && error) {
      centerLabel.textContent = "!";
      tooltipDaily.textContent = "Daily: unavailable";
      tooltipMonthly.textContent = "Monthly: unavailable";
      tooltipRemaining.textContent = "Remaining today: - / Remaining month: -";
      tooltipError.hidden = false;
      tooltipError.textContent = error?.message ? String(error.message) : "Could not fetch credit status.";
      progress.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
      warningBadge.hidden = true;
      return;
    }

    if (!hasData) {
      centerLabel.textContent = "...";
      tooltipDaily.textContent = "Loading credits...";
      tooltipMonthly.textContent = "Loading credits...";
      tooltipRemaining.textContent = "Loading credits...";
      tooltipError.hidden = true;
      tooltipError.textContent = "";
      warningBadge.hidden = true;
      progress.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
      return;
    }

    const dailyUsed = toSafeInt(snapshot?.daily_used, 0);
    const dailyCap = toCapOrUnlimited(snapshot?.daily_cap);
    const monthlyUsed = toSafeInt(snapshot?.monthly_used, 0);
    const monthlyCap = toCapOrUnlimited(snapshot?.monthly_cap);
    const dailyRatio = toPct(dailyUsed, dailyCap);
    const monthlyRatio = toPct(monthlyUsed, monthlyCap);
    const dailyRemaining = dailyCap === null ? "unlimited" : Math.max(0, dailyCap - dailyUsed);
    const monthlyRemaining = monthlyCap === null ? "unlimited" : Math.max(0, monthlyCap - monthlyUsed);
    const dailyExceeded = dailyCap !== null && dailyUsed >= dailyCap;
    const monthlyExceeded = monthlyCap !== null && monthlyUsed >= monthlyCap;
    const exceeded = dailyExceeded || monthlyExceeded;

    root.classList.toggle("is-warning", exceeded);
    warningBadge.hidden = !exceeded;

    if (dailyCap === null) {
      centerLabel.textContent = "\u221E";
      root.classList.add("is-unlimited");
      progress.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
    } else {
      centerLabel.textContent = `${Math.round(clamp01(dailyRatio) * 100)}`;
      const dashOffset = RING_CIRCUMFERENCE * (1 - clamp01(dailyRatio));
      progress.style.strokeDashoffset = String(dashOffset);
    }

    tooltipDaily.textContent = formatUsageLine("Daily", dailyUsed, dailyCap, dailyRatio);
    tooltipMonthly.textContent = formatUsageLine("Monthly", monthlyUsed, monthlyCap, monthlyRatio);
    tooltipRemaining.textContent = `Remaining today: ${dailyRemaining} / Remaining month: ${monthlyRemaining}`;
    tooltipError.hidden = true;
    tooltipError.textContent = "";
  };

  const refresh = async ({ force = false } = {}) => {
    await refreshAgentCreditStatus({ force });
  };

  const onDocumentClick = (event) => {
    if (!root.contains(event.target)) {
      setPinnedOpen(false);
    }
  };

  const onDocumentEscape = (event) => {
    if (event.key === "Escape") {
      setPinnedOpen(false);
    }
  };

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setPinnedOpen(!pinnedOpen);
  });

  refreshButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void refresh({ force: true }).catch((error) => {
      const message = String(error?.message || "").trim();
      showRefreshToast(message || "Unable to refresh credits.");
    });
  });

  const unsubscribe = subscribeAgentCreditStatus(render);
  render(getAgentCreditStatusSnapshot());

  void refresh({ force: false }).catch(() => {});
  const pollHandle = window.setInterval(() => {
    void refresh({ force: false }).catch(() => {});
  }, POLL_MS);

  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentEscape);

  return {
    node: root,
    refresh,
    applyUsageSnapshot: (payload) => applyAgentCreditUsageSnapshot(payload),
    destroy: () => {
      window.clearInterval(pollHandle);
      if (toastTimer) {
        window.clearTimeout(toastTimer);
        toastTimer = null;
      }
      unsubscribe();
      document.removeEventListener("click", onDocumentClick);
      document.removeEventListener("keydown", onDocumentEscape);
    },
  };
};
