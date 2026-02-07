/**
 * DaVeri App - Global Initialization
 * Loads components (sidebar, header) and initializes all subsystems.
 */

const DvApp = (function () {
  function getBasePath() {
    var path = window.location.pathname;
    if (path.includes("/pages/")) return "../";
    return "";
  }

  async function loadComponent(slotId, componentPath) {
    var slot = document.getElementById(slotId);
    if (!slot) return;
    try {
      var res = await fetch(getBasePath() + componentPath);
      if (!res.ok) throw new Error("HTTP " + res.status);
      var html = await res.text();
      slot.innerHTML = html;

      // Execute inline scripts from the loaded HTML
      var scripts = slot.querySelectorAll("script");
      scripts.forEach(function (oldScript) {
        var newScript = document.createElement("script");
        if (oldScript.src) {
          newScript.src = oldScript.src;
        } else {
          newScript.textContent = oldScript.textContent;
        }
        if (oldScript.type) newScript.type = oldScript.type;
        oldScript.parentNode.replaceChild(newScript, oldScript);
      });
    } catch (e) {
      console.warn("[DvApp] Failed to load component:", componentPath, e);
    }
  }

  // Ambient particles
  function initParticles() {
    var canvas = document.getElementById("ambientParticles");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var particles = [];
    var count = 50;

    function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }

    function create() {
      return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        s: Math.random() + 0.8,
        sx: (Math.random() - 0.5) * 0.12,
        sy: (Math.random() - 0.5) * 0.12,
        o: Math.random() * 0.08 + 0.04,
        od: Math.random() > 0.5 ? 1 : -1,
        os: Math.random() * 0.0008 + 0.0004,
      };
    }

    function init() {
      particles = [];
      for (var i = 0; i < count; i++) particles.push(create());
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var light = document.documentElement.getAttribute("data-theme") === "light";
      particles.forEach(function (p) {
        p.x += p.sx; p.y += p.sy;
        if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
        p.o += p.od * p.os;
        if (p.o >= 0.12) { p.o = 0.12; p.od = -1; }
        else if (p.o <= 0.04) { p.o = 0.04; p.od = 1; }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2);
        ctx.fillStyle = light ? "rgba(0,0,0," + p.o + ")" : "rgba(255,255,255," + p.o + ")";
        ctx.fill();
      });
      requestAnimationFrame(animate);
    }

    resize(); init(); animate();
    addEventListener("resize", function () { resize(); init(); });
  }

  async function init() {
    // Load sidebar component
    await loadComponent("sidebar-slot", "components/sidebar.html");

    // Load header component (if slot exists)
    await loadComponent("header-slot", "components/header.html");

    // Initialize subsystems
    if (typeof DvSidebar !== "undefined") DvSidebar.init();
    if (typeof DvRouter !== "undefined") DvRouter.init();
    if (typeof DvLang !== "undefined") DvLang.init();

    // Particles
    initParticles();
  }

  // Auto-init on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return { init: init, loadComponent: loadComponent };
})();
