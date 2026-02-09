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

const applyTheme = (theme, root) => {
  const actualTheme = theme === "system" ? getSystemTheme() : theme;
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

  logoutBtn?.addEventListener("click", () => {
    window.location.href = "https://api.daveri.io/auth/logout";
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

const drawPlanProgress = (root, remainingPercent) => {
  const canvas = root.querySelector("#planLiquidCanvas");
  if (!canvas || typeof canvas.getContext !== "function") return;

  const pct = Math.max(0, Math.min(100, Number.isFinite(remainingPercent) ? remainingPercent : 0));
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
  ctx.clearRect(0, 0, size, size);

  const center = size / 2;
  const radius = 92;
  const start = -Math.PI / 2;
  const end = start + (Math.PI * 2 * pct) / 100;

  ctx.lineWidth = 12;
  ctx.strokeStyle = "rgba(255,255,255,0.13)";
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.stroke();

  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#fb7185");
  gradient.addColorStop(0.5, "#a855f7");
  gradient.addColorStop(1, "#60a5fa");
  ctx.strokeStyle = gradient;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(center, center, radius, start, end);
  ctx.stroke();
};

const applyPlanData = (root, plan) => {
  const planNameEl = root.querySelector("#sidebar-plan-name");
  const planPillEl = root.querySelector("#sidebar-plan-pill");
  const planPercentEl = root.querySelector("#sidebar-plan-percent");
  const creditsMainEl = root.querySelector("#sidebar-plan-credits-main");
  const creditsSubEl = root.querySelector("#sidebar-plan-credits-sub");

  if (!planNameEl || !planPillEl || !planPercentEl || !creditsMainEl || !creditsSubEl) {
    return;
  }

  if (!plan || typeof plan !== "object") {
    planNameEl.textContent = "Plan";
    planPillEl.textContent = "PLAN";
    planPercentEl.textContent = "0%";
    creditsMainEl.textContent = "Plan data unavailable";
    creditsSubEl.textContent = "Unable to load credits.";
    drawPlanProgress(root, 0);
    return;
  }

  const planId = typeof plan.id === "string" && plan.id.trim() ? plan.id.trim() : "standard";
  const normalizedPlanName = `${planId.charAt(0).toUpperCase()}${planId.slice(1)}`;
  const status = typeof plan.status === "string" && plan.status.trim() ? plan.status.trim() : "active";
  const limit = Number(plan.credits_limit);
  const used = Number(plan.credits_used);
  const hasLimit = Number.isFinite(limit) && limit >= 0;
  const safeUsed = Number.isFinite(used) ? Math.max(0, used) : 0;
  const safeRemaining = hasLimit
    ? Math.max(0, Number.isFinite(Number(plan.credits_remaining)) ? Number(plan.credits_remaining) : limit - safeUsed)
    : null;
  const remainingPercent = Number.isFinite(Number(plan.credits_percent_remaining))
    ? Math.max(0, Math.min(100, Number(plan.credits_percent_remaining)))
    : hasLimit && limit > 0
      ? Math.max(0, Math.min(100, Math.round((safeRemaining / limit) * 100)))
      : 0;

  planNameEl.textContent = normalizedPlanName;
  planPillEl.textContent = status.toUpperCase();
  planPercentEl.textContent = `${remainingPercent}%`;

  if (hasLimit) {
    creditsMainEl.textContent = `${formatNumber(safeRemaining)} credits left`;
    creditsSubEl.textContent = `${formatNumber(safeUsed)} used from ${formatNumber(limit)} this period.`;
  } else {
    creditsMainEl.textContent = `${formatNumber(safeUsed)} credits used`;
    creditsSubEl.textContent = "No monthly limit available.";
  }

  drawPlanProgress(root, remainingPercent);
};

const loadUser = async (root, authEndpoint) => {
  try {
    const endpointCandidates = Array.from(
      new Set(
        [
          authEndpoint,
          "https://api.daveri.io/auth/me",
          "https://api.daveri.io/api/me",
        ].filter(Boolean)
      )
    );

    let data = null;
    for (const endpoint of endpointCandidates) {
      const response = await fetch(endpoint, { credentials: "include" });
      if (!response.ok) continue;
      const payload = await response.json();
      if (payload?.logged) {
        data = payload;
        break;
      }
    }

    if (!data?.logged) {
      applyPlanData(root, null);
      return;
    }

    const user = data.user || {};
    if (user.id) {
      root.dataset.userId = user.id;
    } else if (user.email) {
      root.dataset.userId = user.email;
    }
    if (user.email) {
      root.dataset.userEmail = user.email;
    }

    const userName = root.querySelector("#userName");
    const userSub = root.querySelector("#userSub");
    const avatarBox = root.querySelector("#avatarBox");

    if (userName) {
      userName.textContent = user.name || user.email || "Użytkownik";
    }
    if (userSub) {
      userSub.textContent = user.email || "";
    }
    if (avatarBox) {
      const avatarUrl = user.avatar_url || user.picture || null;
      if (avatarUrl) {
        avatarBox.innerHTML = `<img src="${avatarUrl}" alt="Avatar" />`;
      } else {
        avatarBox.textContent = getInitials(user.name || user.email || "U");
      }
    }

    let planPayload = data.plan || null;
    if (!planPayload) {
      try {
        const fallback = await fetch("https://api.daveri.io/api/me", { credentials: "include" });
        if (fallback.ok) {
          const fallbackData = await fallback.json();
          if (fallbackData?.logged && fallbackData?.plan) {
            planPayload = fallbackData.plan;
          }
        }
      } catch (error) {
        console.warn("[Sidebar] plan fallback failed", error);
      }
    }

    applyPlanData(root, planPayload);
  } catch (error) {
    console.error("[Sidebar] auth load failed", error);
    applyPlanData(root, null);
  }
};

export const initSidebar = async (root, options = {}) => {
  if (!root) return;
  const routes = { ...DEFAULT_ROUTES, ...options.routes };
  const authEndpoint = options.authEndpoint || "https://api.daveri.io/auth/me";

  const sidebar = root.querySelector(".sidebar");
  if (!sidebar) return;

  restoreSidebarState(sidebar);
  initTheme(root);
  initNavigation(root, routes);
  initDropdowns(root);
  initCollapseToggle(root);
  await loadUser(root, authEndpoint);
};
