import { mountSidebarIcons } from "../components/brand/SidebarIcon.js";
import {
  ensureAccountState,
  getAccountState,
  refreshCredits,
  subscribeAccountState,
} from "./account-state.js";
import { getLoginUrl } from "./auth-store.js";
import { supabase } from "./supabaseClient.js";

const DEFAULT_ROUTES = {
  panel: "/dashboard",
  boty: "/bots",
  historia: "/history",
  prompt: "/prompts",
  wyglad: "/appearance",
  pliki: "/files",
  instalacja: "/install",
};

const THEME_KEY = "daveri_theme";
const COLLAPSE_KEY = "daveri_sidebar_collapsed";
const SIDEBAR_EXPANDED = 260;
const SIDEBAR_COLLAPSED = 72;
const SUPPORTED_LANGS = new Set(["en", "pl", "de", "fr", "es", "pt"]);

const normalizePath = (path) => {
  if (!path) return "/";
  const withoutIndex = path.replace(/\/index\.html$/, "");
  const trimmed = withoutIndex.replace(/\/$/, "");
  return trimmed || "/";
};

const stripLanguagePrefix = (path) => {
  const normalized = normalizePath(path);
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length > 0 && SUPPORTED_LANGS.has(segments[0])) {
    segments.shift();
  }
  return segments.length ? `/${segments.join("/")}` : "/";
};

const getLocalizedRoute = (routePath) => {
  const normalized = normalizePath(routePath);
  const languageApi = window?.DaVeriLanguage;
  const currentLang = languageApi?.getCurrentLanguage?.();
  if (languageApi?.buildLanguageUrl && currentLang) {
    return languageApi.buildLanguageUrl(currentLang, { pathname: normalized });
  }
  return normalized;
};

const getInitials = (value) => {
  if (!value) return "";
  const parts = value.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join("");
};

const getSystemTheme = () =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

let themeTransitionTimeout = null;

const ensureThemeTransitionStyles = () => {
  if (document.getElementById("daveri-theme-transition-style")) return;
  const style = document.createElement("style");
  style.id = "daveri-theme-transition-style";
  style.textContent = `
    html.theme-transitioning,
    html.theme-transitioning body,
    html.theme-transitioning body::before,
    html.theme-transitioning body::after,
    html.theme-transitioning * {
      transition:
        background-color .34s var(--dv-ease, ease),
        color .34s var(--dv-ease, ease),
        border-color .34s var(--dv-ease, ease),
        box-shadow .34s var(--dv-ease, ease),
        opacity .34s var(--dv-ease, ease),
        fill .34s var(--dv-ease, ease),
        stroke .34s var(--dv-ease, ease);
    }
  `;
  document.head.appendChild(style);
};

const animateThemeTransition = () => {
  ensureThemeTransitionStyles();
  document.documentElement.classList.add("theme-transitioning");
  if (themeTransitionTimeout) {
    window.clearTimeout(themeTransitionTimeout);
  }
  themeTransitionTimeout = window.setTimeout(() => {
    document.documentElement.classList.remove("theme-transitioning");
  }, 420);
};

const applyTheme = (theme, root) => {
  const actualTheme = theme === "system" ? getSystemTheme() : theme;
  const previousTheme = document.documentElement.getAttribute("data-theme");
  if (previousTheme && previousTheme !== actualTheme) {
    animateThemeTransition();
  }
  document.documentElement.setAttribute("data-theme", actualTheme);

  root.querySelectorAll(".theme-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.theme === theme);
  });

  localStorage.setItem(THEME_KEY, theme);
};

const initTheme = (root) => {
  const saved = localStorage.getItem(THEME_KEY) || "system";
  applyTheme(saved, root);

  root.querySelectorAll(".theme-btn").forEach((button) => {
    button.addEventListener("click", () => {
      applyTheme(button.dataset.theme, root);
    });
  });

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", () => {
    const current = localStorage.getItem(THEME_KEY) || "system";
    if (current === "system") {
      applyTheme("system", root);
    }
  });
};

const updateSidebarWidth = (sidebar) => {
  if (!sidebar) return;
  if (sidebar.classList.contains("hidden")) {
    document.documentElement.style.setProperty("--dv-sidebar-w", "0px");
    return;
  }
  const width = sidebar.classList.contains("collapsed") ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;
  document.documentElement.style.setProperty("--dv-sidebar-w", `${width}px`);
};

const restoreSidebarState = (sidebar) => {
  const collapsed = localStorage.getItem(COLLAPSE_KEY) === "1";
  sidebar.classList.toggle("collapsed", collapsed);
  updateSidebarWidth(sidebar);
};

const setCollapsed = (sidebar, collapsed) => {
  sidebar.classList.toggle("collapsed", collapsed);
  localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  updateSidebarWidth(sidebar);
};

const initNavigation = (root, routes) => {
  const navItems = root.querySelectorAll(".nav-item[data-route]");
  const currentPath = stripLanguagePrefix(window.location.pathname);

  navItems.forEach((item) => {
    const routeKey = item.dataset.route;
    const routePath = routes[routeKey];
    if (!routePath) return;

    const normalizedRoute = stripLanguagePrefix(routePath);
    if (currentPath === normalizedRoute) {
      item.classList.add("active");
    }

    item.addEventListener("click", () => {
      navItems.forEach((nav) => nav.classList.remove("active"));
      item.classList.add("active");
      window.location.href = getLocalizedRoute(routePath);
    });

    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        item.click();
      }
    });
  });
};

const initDropdowns = (root) => {
  const userBtn = root.querySelector("#userBtn");
  const userDropdown = root.querySelector("#userDropdown");
  const logoutBtn = root.querySelector("#logoutBtn");
  const profileBtn = root.querySelector("#goProfileBtn");

  if (!userBtn || !userDropdown) return;

  const closeDropdown = () => userDropdown.classList.remove("open");

  userBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    userDropdown.classList.toggle("open");
  });

  document.addEventListener("click", closeDropdown);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDropdown();
    }
  });

  logoutBtn?.addEventListener("click", async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("[Sidebar] signOut failed", error);
    } finally {
      window.location.href = getLoginUrl();
    }
  });

  profileBtn?.addEventListener("click", () => {
    window.location.href = getLocalizedRoute("/settings");
  });
};

const initCollapseToggle = (root) => {
  const sidebar = root.querySelector(".sidebar");
  const collapseBtn = root.querySelector("#collapseBtn");
  const mark = root.querySelector(".mark");

  if (!sidebar) return;

  collapseBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    setCollapsed(sidebar, !sidebar.classList.contains("collapsed"));
  });

  mark?.addEventListener("click", (event) => {
    if (!sidebar.classList.contains("collapsed")) return;
    event.preventDefault();
    setCollapsed(sidebar, false);
  });
};

const formatNumber = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return new Intl.NumberFormat("en-US").format(numeric);
};

const liquidRenderState = new WeakMap();

const createLiquidGradient = (ctx, size, topY, bottomY) => {
  const gradient = ctx.createLinearGradient(size * 0.15, topY, size * 0.85, bottomY);
  gradient.addColorStop(0, "rgba(251, 113, 133, 0.95)");
  gradient.addColorStop(0.5, "rgba(168, 85, 247, 0.9)");
  gradient.addColorStop(1, "rgba(96, 165, 250, 0.85)");
  return gradient;
};

const drawLiquidWave = (ctx, config) => {
  const { size, radius, levelY, amplitude, frequency, phase } = config;
  ctx.beginPath();
  ctx.moveTo(-2, size + 2);
  for (let x = -2; x <= size + 2; x += 2) {
    const y = levelY + Math.sin(x * frequency + phase) * amplitude;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(size + 2, size + 2);
  ctx.closePath();

  const topY = Math.max(levelY - amplitude * 2, size / 2 - radius);
  const bottomY = size / 2 + radius;
  ctx.fillStyle = createLiquidGradient(ctx, size, topY, bottomY);
  ctx.fill();
};

const paintLiquidProgress = (ctx, size, percent, phase) => {
  const center = size / 2;
  const radius = 92;
  const clamped = Math.max(0, Math.min(100, percent));
  const levelY = center + radius - (clamped / 100) * (radius * 2);
  const amplitude = 4 + (1 - clamped / 100) * 2;

  ctx.clearRect(0, 0, size, size);

  ctx.beginPath();
  ctx.arc(center, center, radius + 7, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(center - radius, center - radius, radius * 2, radius * 2);

  drawLiquidWave(ctx, {
    size,
    radius,
    levelY,
    amplitude,
    frequency: 0.05,
    phase,
  });

  ctx.globalAlpha = 0.46;
  drawLiquidWave(ctx, {
    size,
    radius,
    levelY: levelY + 4,
    amplitude: amplitude * 0.75,
    frequency: 0.07,
    phase: -phase * 1.25,
  });
  ctx.globalAlpha = 1;

  ctx.restore();

  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.24)";
  ctx.lineWidth = 1;
  ctx.stroke();
};

const drawPlanProgress = (root, remainingPercent) => {
  const canvas = root.querySelector("#planLiquidCanvas");
  if (!canvas || typeof canvas.getContext !== "function") return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const size = 220;
  const dpr = window.devicePixelRatio || 1;
  const targetWidth = Math.floor(size * dpr);
  const targetHeight = Math.floor(size * dpr);

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  let state = liquidRenderState.get(canvas);
  if (!state) {
    state = {
      value: 0,
      target: 0,
      phase: 0,
      rafId: null,
    };
    liquidRenderState.set(canvas, state);
  }
  state.target = Math.max(0, Math.min(100, Number.isFinite(remainingPercent) ? remainingPercent : 0));

  if (state.rafId != null) return;

  const loop = () => {
    if (!canvas.isConnected) {
      state.rafId = null;
      return;
    }

    state.value += (state.target - state.value) * 0.08;
    state.phase += 0.045;
    if (state.phase > Math.PI * 2) state.phase -= Math.PI * 2;
    paintLiquidProgress(ctx, size, state.value, state.phase);
    state.rafId = window.requestAnimationFrame(loop);
  };

  state.rafId = window.requestAnimationFrame(loop);
};


const formatResetTime = (value) => {
  if (!value || typeof value !== "string") return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
};

const formatPlanName = (planId) => {
  if (!planId || typeof planId !== "string") return "Plan";
  return planId
    .trim()
    .split("_")
    .filter(Boolean)
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(" ");
};

const updateTooltipRow = (element, label, value) => {
  if (!element) return;
  element.textContent = `${label}: ${value}`;
};

const toNonNegativeOrNull = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, numeric);
};

const getAuthPlanId = () => {
  const value =
    window?.DaVeriAuth?.session?.user?.user_metadata?.plan_id ||
    window?.DaVeriAuth?.session?.user?.app_metadata?.plan_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const applyPlanData = (root, status) => {
  const planNameEl = root.querySelector("#sidebar-plan-name");
  const planPillEl = root.querySelector("#sidebar-plan-pill");
  const planPercentEl = root.querySelector("#sidebar-plan-percent");
  const planLiquidSubEl = root.querySelector(".plan-liquid-sub");
  const creditsMainEl = root.querySelector("#sidebar-plan-credits-main");
  const creditsSubEl = root.querySelector("#sidebar-plan-credits-sub");
  const monthlyEl = root.querySelector("#sidebar-plan-tooltip-monthly");
  const dailyEl = root.querySelector("#sidebar-plan-tooltip-daily");
  const dailyResetEl = root.querySelector("#sidebar-plan-tooltip-daily-reset");
  const monthlyResetEl = root.querySelector("#sidebar-plan-tooltip-monthly-reset");

  if (!planNameEl || !planPillEl || !planPercentEl || !creditsMainEl || !creditsSubEl) {
    return;
  }

  if (!status || typeof status !== "object") {
    planNameEl.textContent = "Plan";
    planPillEl.textContent = "CREDITS";
    planPercentEl.textContent = "0";
    if (planLiquidSubEl) {
      planLiquidSubEl.textContent = "REMAINING";
    }
    creditsMainEl.textContent = "Credits unavailable";
    creditsSubEl.textContent = "Unable to load credit status.";
    updateTooltipRow(monthlyEl, "Monthly", "-- / --");
    updateTooltipRow(dailyEl, "Daily", "-- / --");
    updateTooltipRow(dailyResetEl, "Reset daily", "--");
    updateTooltipRow(monthlyResetEl, "Reset monthly", "--");
    drawPlanProgress(root, 0);
    return;
  }

  const planIdFromStatus =
    typeof status.plan_id === "string" && status.plan_id.trim() ? status.plan_id.trim() : null;
  const planId = getAuthPlanId() || planIdFromStatus || "plan";
  const safeMonthlyLimit = toNonNegativeOrNull(status.monthly_limit);
  const safeMonthlyBalance = toNonNegativeOrNull(status.monthly_balance);
  const safeDailyCap = toNonNegativeOrNull(status.daily_cap);
  const safeDailyBalance = toNonNegativeOrNull(status.daily_balance);

  const fallbackRemainingFromBalances =
    (safeMonthlyBalance !== null ? safeMonthlyBalance : 0) +
    (safeDailyBalance !== null ? safeDailyBalance : 0);
  const safeRemaining = toNonNegativeOrNull(status.remaining) ?? fallbackRemainingFromBalances;

  const capacityFromStatus = toNonNegativeOrNull(status.capacity);
  const capacityFromLimits =
    safeMonthlyLimit !== null || safeDailyCap !== null
      ? (safeMonthlyLimit !== null ? safeMonthlyLimit : 0) + (safeDailyCap !== null ? safeDailyCap : 0)
      : null;
  const capacityFallback = safeRemaining > 0 ? safeRemaining : 0;
  const safeCapacity = Math.max(capacityFromStatus ?? 0, capacityFromLimits ?? 0, capacityFallback);
  const remainingPercent =
    safeCapacity > 0 ? Math.max(0, Math.min(100, Math.round((safeRemaining / safeCapacity) * 100))) : 0;

  planNameEl.textContent = formatPlanName(planId);
  planPillEl.textContent = "CREDITS";
  planPercentEl.textContent = formatNumber(safeRemaining);
  if (planLiquidSubEl) {
    planLiquidSubEl.textContent = `${remainingPercent}%`;
  }
  creditsMainEl.textContent = `${formatNumber(safeRemaining)} credits`;
  creditsSubEl.textContent = `${remainingPercent}% available (${formatNumber(safeCapacity)} capacity)`;

  updateTooltipRow(
    monthlyEl,
    "Monthly",
    `${formatNumber(safeMonthlyBalance)} / ${formatNumber(safeMonthlyLimit)}`
  );
  updateTooltipRow(dailyEl, "Daily", `${formatNumber(safeDailyBalance)} / ${formatNumber(safeDailyCap)}`);
  updateTooltipRow(dailyResetEl, "Reset daily", formatResetTime(status.next_daily_reset));
  updateTooltipRow(monthlyResetEl, "Reset monthly", formatResetTime(status.next_monthly_reset));

  drawPlanProgress(root, remainingPercent);
};

const loadCreditStatus = async (root) => {
  try {
    await ensureAccountState();
    let status = getAccountState()?.credits || null;
    if (!status) {
      status = await refreshCredits();
    }
    applyPlanData(root, status);
  } catch (error) {
    console.error("[Sidebar] credit status load failed", {
      code: error?.code || null,
      message: error?.message || "unknown_error",
    });
    applyPlanData(root, null);
  }
};
const bindCreditStatusEvents = (root) => {
  if (root.__daveriCreditsBound) return;
  root.__daveriCreditsBound = true;
  subscribeAccountState((state) => {
    applyPlanData(root, state?.credits || null);
  });
};
const loadUser = async (root) => {
  const sessionUser = window?.DaVeriAuth?.session?.user || null;
  if (!sessionUser) {
    applyPlanData(root, null);
    return false;
  }

  const userId = typeof sessionUser.id === "string" && sessionUser.id.trim() ? sessionUser.id.trim() : null;
  const userEmail =
    typeof sessionUser.email === "string" && sessionUser.email.trim() ? sessionUser.email.trim() : null;
  const userMetadata =
    sessionUser.user_metadata && typeof sessionUser.user_metadata === "object"
      ? sessionUser.user_metadata
      : {};
  const displayName =
    (typeof userMetadata.full_name === "string" && userMetadata.full_name.trim()) ||
    (typeof userMetadata.name === "string" && userMetadata.name.trim()) ||
    userEmail ||
    "User";
  const avatarUrl =
    (typeof userMetadata.avatar_url === "string" && userMetadata.avatar_url.trim()) ||
    (typeof userMetadata.picture === "string" && userMetadata.picture.trim()) ||
    null;

  if (userId) {
    root.dataset.userId = userId;
  } else if (userEmail) {
    root.dataset.userId = userEmail;
  }
  if (userEmail) {
    root.dataset.userEmail = userEmail;
  }

  const userName = root.querySelector("#userName");
  const userSub = root.querySelector("#userSub");
  const avatarBox = root.querySelector("#avatarBox");

  if (userName) {
    userName.textContent = displayName;
  }
  if (userSub) {
    userSub.textContent = userEmail || "";
  }
  if (avatarBox) {
    if (avatarUrl) {
      avatarBox.innerHTML = `<img src="${avatarUrl}" alt="Avatar" />`;
    } else {
      avatarBox.textContent = getInitials(displayName || userEmail || "U");
    }
  }

  return true;
};

export const initSidebar = async (root, options = {}) => {
  if (!root) return;
  const routes = { ...DEFAULT_ROUTES, ...options.routes };
  const sidebar = root.querySelector(".sidebar");
  if (!sidebar) return;

  mountSidebarIcons(root);
  restoreSidebarState(sidebar);
  initTheme(root);
  initNavigation(root, routes);
  initDropdowns(root);
  initCollapseToggle(root);
  bindCreditStatusEvents(root);
  const isLogged = await loadUser(root);
  if (isLogged) {
    await loadCreditStatus(root);
  }
};

