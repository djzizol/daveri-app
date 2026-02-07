(() => {
  if (window.__DV_SIDEBAR_LOADER) return;
  window.__DV_SIDEBAR_LOADER = true;

  const routeMap = {
    panel: "/dashboard/",
    boty: "/bots/",
    historia: "/history/",
    prompt: "/prompts/",
    wyglad: "/appearance/",
    pliki: "/files/",
    instalacja: "/install/",
  };

  const buildUrl = (path) => {
    try {
      return new URL(path, window.location.href).toString();
    } catch (error) {
      return path;
    }
  };

  window.bubble_fn_nav ||= ((route) => {
    const target = routeMap[route];
    if (!target) return;
    window.location.href = buildUrl(target);
  });

  window.bubble_fn_profile ||= (() => {
    window.location.href = buildUrl("/settings/");
  });

  const injectSidebar = async () => {
    if (document.getElementById("chatekai_root")) return;

    const sidebarUrl = buildUrl("../components/sidebar.html");
    const response = await fetch(sidebarUrl);
    if (!response.ok) return;

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    const style = doc.querySelector("style");
    if (style && !document.getElementById("dv-sidebar-style")) {
      const clone = style.cloneNode(true);
      clone.id = "dv-sidebar-style";
      document.head.appendChild(clone);
    }

    const root = doc.getElementById("chatekai_root");
    if (!root) return;

    const pageUserSource = document.querySelector("[data-user-id]");
    const syncUserId = () => {
      const userId = pageUserSource?.dataset?.userId;
      if (userId) {
        root.dataset.userId = userId;
      }
    };
    syncUserId();

    if (pageUserSource) {
      const observer = new MutationObserver(() => syncUserId());
      observer.observe(pageUserSource, { attributes: true, attributeFilter: ["data-user-id"] });
    }

    document.body.insertBefore(root, document.body.firstChild);

    const moduleScript = doc.querySelector('script[type="module"]');
    if (moduleScript && !document.getElementById("dv-sidebar-script")) {
      const script = document.createElement("script");
      script.type = "module";
      script.id = "dv-sidebar-script";
      script.textContent = moduleScript.textContent;
      document.body.appendChild(script);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectSidebar);
  } else {
    injectSidebar();
  }
})();
