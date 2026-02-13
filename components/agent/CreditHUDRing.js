import {
  applyAgentCreditUsageSnapshot,
  getAgentCreditStatusSnapshot,
  refreshAgentCreditStatus,
  subscribeAgentCreditStatus,
} from "../../js/agent-credit-status-store.js";
import { trackEvent } from "../../js/analytics.js";

const RING_RADIUS = 14;
const RING_SIZE = 34;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const POLL_MS = 60_000;

const clamp01 = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

const toSafeInt = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
};

const toPct = (used, cap) => {
  if (!Number.isFinite(cap) || cap <= 0) return 0;
  return clamp01(used / cap);
};

const formatPct = (ratio) => `${(clamp01(ratio) * 100).toFixed(1)}%`;

const formatUsageLine = (label, used, cap, ratio) =>
  `${label}: ${used} / ${cap} (${formatPct(ratio)})`;

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

  tooltipActions.appendChild(refreshButton);
  tooltip.appendChild(tooltipTitle);
  tooltip.appendChild(tooltipDaily);
  tooltip.appendChild(tooltipMonthly);
  tooltip.appendChild(tooltipRemaining);
  tooltip.appendChild(tooltipError);
  tooltip.appendChild(tooltipActions);

  root.appendChild(trigger);
  root.appendChild(tooltip);

  let pinnedOpen = false;
  let warningTracked = false;

  const setPinnedOpen = (isOpen) => {
    pinnedOpen = Boolean(isOpen);
    root.classList.toggle("is-open", pinnedOpen);
  };

  const render = (snapshot) => {
    const status = snapshot?.status || "idle";
    const data = snapshot?.data || null;
    const error = snapshot?.error || null;

    root.classList.toggle("is-loading", status === "idle" || status === "loading" || status === "refreshing");
    root.classList.toggle("is-error", status === "error");
    root.classList.remove("is-warning", "is-no-access");

    if (status === "idle" || status === "loading" || status === "refreshing") {
      centerLabel.textContent = "...";
      tooltipDaily.textContent = "Daily: loading...";
      tooltipMonthly.textContent = "Monthly: loading...";
      tooltipRemaining.textContent = "Remaining today: ... / Remaining month: ...";
      tooltipError.hidden = true;
      progress.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
      warningBadge.hidden = true;
      warningTracked = false;
      return;
    }

    if (status === "error" || !data) {
      centerLabel.textContent = "!";
      tooltipDaily.textContent = "Daily: unavailable";
      tooltipMonthly.textContent = "Monthly: unavailable";
      tooltipRemaining.textContent = "Remaining today: - / Remaining month: -";
      tooltipError.hidden = false;
      tooltipError.textContent = error?.message ? String(error.message) : "Could not fetch credit status.";
      progress.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
      warningBadge.hidden = true;
      warningTracked = false;
      return;
    }

    const dailyUsed = toSafeInt(data.daily_used);
    const dailyCap = toSafeInt(data.daily_cap);
    const monthlyUsed = toSafeInt(data.monthly_used);
    const monthlyCap = toSafeInt(data.monthly_cap);
    const dailyRatio = toPct(dailyUsed, dailyCap);
    const monthlyRatio = toPct(monthlyUsed, monthlyCap);
    const dailyRemaining = Math.max(0, dailyCap - dailyUsed);
    const monthlyRemaining = Math.max(0, monthlyCap - monthlyUsed);
    const noAccess = dailyCap === 0 || monthlyCap === 0;
    const nearLimit =
      !noAccess &&
      ((dailyCap > 0 && dailyRatio >= 0.8) || (monthlyCap > 0 && monthlyRatio >= 0.8));

    root.classList.toggle("is-warning", nearLimit);
    root.classList.toggle("is-no-access", noAccess);
    warningBadge.hidden = !nearLimit;

    if (nearLimit && !warningTracked) {
      trackEvent("quota_warning_shown", {
        daily_used: dailyUsed,
        daily_cap: dailyCap,
        monthly_used: monthlyUsed,
        monthly_cap: monthlyCap,
      });
      warningTracked = true;
    } else if (!nearLimit) {
      warningTracked = false;
    }

    if (noAccess) {
      centerLabel.textContent = "0";
      tooltipDaily.textContent = "Daily: 0 / 0";
      tooltipMonthly.textContent = "Monthly: 0 / 0";
      tooltipRemaining.textContent = "Brak dostepu do kredytow AI. Wybierz plan, aby odblokowac wysylke.";
      tooltipError.hidden = true;
      tooltipError.textContent = "";
      progress.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
      return;
    }

    centerLabel.textContent = `${Math.round(dailyRatio * 100)}`;
    tooltipDaily.textContent = formatUsageLine("Daily", dailyUsed, dailyCap, dailyRatio);
    tooltipMonthly.textContent = formatUsageLine("Monthly", monthlyUsed, monthlyCap, monthlyRatio);
    tooltipRemaining.textContent = `Remaining today: ${dailyRemaining} / Remaining month: ${monthlyRemaining}`;
    tooltipError.hidden = true;
    tooltipError.textContent = "";

    const dashOffset = RING_CIRCUMFERENCE * (1 - dailyRatio);
    progress.style.strokeDashoffset = String(dashOffset);
  };

  const refresh = async ({ force = false } = {}) => {
    try {
      await refreshAgentCreditStatus({ force });
    } catch {}
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
    void refresh({ force: true });
  });

  const unsubscribe = subscribeAgentCreditStatus(render);
  render(getAgentCreditStatusSnapshot());

  void refresh({ force: false });
  const pollHandle = window.setInterval(() => {
    void refresh({ force: false });
  }, POLL_MS);

  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentEscape);

  return {
    node: root,
    refresh,
    applyUsageSnapshot: (payload) => applyAgentCreditUsageSnapshot(payload),
    destroy: () => {
      window.clearInterval(pollHandle);
      unsubscribe();
      document.removeEventListener("click", onDocumentClick);
      document.removeEventListener("keydown", onDocumentEscape);
    },
  };
};
