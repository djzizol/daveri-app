/**
 * DaVeri Sidebar Interactions
 * Handles collapse/expand, theme toggle, navigation clicks, and sidebar state sync.
 */

const DvSidebar = (function () {
  const LS_KEY = "chatekai_sidebar_collapsed";
  const LS_THEME_KEY = "chatekai_theme";
  const SIDEBAR_EXPANDED = 260;
  const SIDEBAR_COLLAPSED = 72;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function getRoot() {
    const roots = $$("#chatekai_root");
    return roots.length ? roots[roots.length - 1] : null;
  }

  function getSidebar() {
    const root = getRoot();
    return root ? $("#sidebar", root) : null;
  }

  // ===== COLLAPSE =====
  function isCollapsed() {
    const sb = getSidebar();
    return sb ? sb.classList.contains("collapsed") : false;
  }

  function toggle() {
    const sb = getSidebar();
    if (!sb) return;
    sb.classList.toggle("collapsed");
    saveSidebarState(sb);
    syncWidth();
  }

  function saveSidebarState(sb) {
    try { localStorage.setItem(LS_KEY, sb.classList.contains("collapsed") ? "1" : "0"); } catch (e) {}
  }

  function restoreSidebarState() {
    const sb = getSidebar();
    if (!sb) return;
    try {
      if (localStorage.getItem(LS_KEY) === "1") sb.classList.add("collapsed");
    } catch (e) {}
  }

  function syncWidth() {
    const sb = getSidebar();
    if (!sb) { updateWidth(0); return; }
    if (sb.classList.contains("hidden")) updateWidth(0);
    else if (sb.classList.contains("collapsed")) updateWidth(SIDEBAR_COLLAPSED);
    else updateWidth(SIDEBAR_EXPANDED);
  }

  function updateWidth(w) {
    document.documentElement.style.setProperty("--dv-sidebar-w", w + "px");
  }

  // ===== THEME =====
  function getSystemTheme() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    var actual = theme === "system" ? getSystemTheme() : theme;
    document.documentElement.setAttribute("data-theme", actual);
    $$(".theme-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.theme === theme);
    });
    try { localStorage.setItem(LS_THEME_KEY, theme); } catch (e) {}
  }

  function initTheme() {
    var saved;
    try { saved = localStorage.getItem(LS_THEME_KEY); } catch (e) {}
    applyTheme(saved || "system");

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
      var cur;
      try { cur = localStorage.getItem(LS_THEME_KEY); } catch (e) {}
      if ((cur || "system") === "system") applyTheme("system");
    });
  }

  // ===== NAVIGATION =====
  function getPageMap() {
    return {
      panel: "../pages/dashboard.html",
      boty: "../pages/bots.html",
      historia: "../pages/history.html",
      prompt: "../pages/prompts.html",
      wyglad: "../pages/appearance.html",
      pliki: "../pages/files.html",
      instalacja: "../pages/install.html",
    };
  }

  function handleNavClick(route) {
    var pages = getPageMap();
    if (pages[route]) {
      window.location.href = pages[route];
    }
  }

  // ===== EVENTS =====
  function wireEvents() {
    document.addEventListener("click", function (e) {
      // Collapse button
      var collapseBtn = e.target.closest("#collapseBtn");
      if (collapseBtn) { e.preventDefault(); toggle(); return; }

      // Logo click when collapsed
      var mark = e.target.closest(".mark");
      var sb = getSidebar();
      if (mark && sb && sb.contains(mark) && sb.classList.contains("collapsed")) {
        e.preventDefault(); toggle(); return;
      }

      // Theme buttons
      var themeBtn = e.target.closest(".theme-btn");
      if (themeBtn && themeBtn.dataset.theme) {
        applyTheme(themeBtn.dataset.theme); return;
      }

      // Nav items
      var navItem = e.target.closest(".nav-item");
      if (navItem && sb && sb.contains(navItem)) {
        var route = navItem.getAttribute("data-route");
        if (route) {
          // Highlight
          $$(".nav-item", sb).forEach(function (x) { x.classList.remove("active"); });
          navItem.classList.add("active");
          handleNavClick(route);
        }
        return;
      }
    }, true);
  }

  // ===== SIDEBAR OBSERVER (for pages) =====
  function observeSidebar() {
    var root = getRoot();
    if (!root) { setTimeout(observeSidebar, 500); return; }
    var sb = root.querySelector(".sidebar");
    if (!sb) { setTimeout(observeSidebar, 500); return; }
    syncWidth();
    new MutationObserver(function (muts) {
      muts.forEach(function (m) { if (m.attributeName === "class") syncWidth(); });
    }).observe(sb, { attributes: true });
  }

  // ===== INIT =====
  function init() {
    restoreSidebarState();
    initTheme();
    wireEvents();
    observeSidebar();
    syncWidth();
  }

  return { init: init, toggle: toggle, syncWidth: syncWidth, isCollapsed: isCollapsed };
})();
