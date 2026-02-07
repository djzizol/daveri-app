/**
 * DaVeri Router
 * Handles navigation and active link highlighting.
 */

const DvRouter = (function () {
  function getCurrentPage() {
    const path = window.location.pathname;
    const file = path.split("/").pop().replace(".html", "");
    return file || "index";
  }

  function highlightActiveLink() {
    const page = getCurrentPage();

    // Map page filenames to sidebar data-route values
    const routeMap = {
      dashboard: "panel",
      bots: "boty",
      history: "historia",
      prompts: "prompt",
      appearance: "wyglad",
      files: "pliki",
      install: "instalacja",
    };

    const route = routeMap[page] || page;

    document.querySelectorAll("#chatekai_root .nav-item").forEach(function (item) {
      const itemRoute = item.getAttribute("data-route");
      item.classList.toggle("active", itemRoute === route);
    });
  }

  function navigate(url) {
    window.location.href = url;
  }

  function init() {
    // Highlight active link after sidebar loads
    setTimeout(highlightActiveLink, 300);

    // Also try multiple times in case sidebar loads late
    let tries = 0;
    const interval = setInterval(function () {
      tries++;
      highlightActiveLink();
      if (tries >= 10) clearInterval(interval);
    }, 200);
  }

  return { init: init, navigate: navigate, getCurrentPage: getCurrentPage, highlightActiveLink: highlightActiveLink };
})();
