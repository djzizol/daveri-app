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

const normalizePath = (path) => {
  if (!path) return "/";
  const withoutIndex = path.replace(/\/index\.html$/, "");
  const trimmed = withoutIndex.replace(/\/$/, "");
  return trimmed || "/";
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
  const currentPath = normalizePath(window.location.pathname);

  navItems.forEach((item) => {
    const routeKey = item.dataset.route;
    const routePath = routes[routeKey];
    if (!routePath) return;

    const normalizedRoute = normalizePath(routePath);
    if (currentPath === normalizedRoute) {
      item.classList.add("active");
    }

    item.addEventListener("click", () => {
      navItems.forEach((nav) => nav.classList.remove("active"));
      item.classList.add("active");
      window.location.href = routePath;
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
    window.location.href = "/settings";
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

const loadUser = async (root, authEndpoint) => {
  try {
    const response = await fetch(authEndpoint, { credentials: "include" });
    if (!response.ok) return;

    const data = await response.json();
    if (!data?.logged) return;

    const user = data.user || {};
    if (user.email) {
      root.dataset.userId = user.email;
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
      if (user.avatar_url) {
        avatarBox.innerHTML = `<img src="${user.avatar_url}" alt="Avatar" />`;
      } else {
        avatarBox.textContent = getInitials(user.name || user.email || "U");
      }
    }
  } catch (error) {
    console.error("[Sidebar] auth load failed", error);
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
