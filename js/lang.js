/**
 * DaVeri Language System
 * Loads language files and replaces [data-i18n] text dynamically.
 * Stores selected language in localStorage.
 */

const DvLang = (function () {
  const LS_KEY = "daveri_lang";
  const SUPPORTED = ["en", "pl", "es"];
  const DEFAULT = "pl";

  let current = DEFAULT;
  let translations = {};

  function getBasePath() {
    const path = window.location.pathname;
    if (path.includes("/pages/")) return "../lang/";
    return "lang/";
  }

  function getSaved() {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved && SUPPORTED.includes(saved)) return saved;
    } catch (e) {}
    return DEFAULT;
  }

  function save(lang) {
    try { localStorage.setItem(LS_KEY, lang); } catch (e) {}
  }

  async function load(lang) {
    if (!SUPPORTED.includes(lang)) lang = DEFAULT;
    const base = getBasePath();
    try {
      const res = await fetch(base + lang + ".json");
      if (!res.ok) throw new Error("HTTP " + res.status);
      translations = await res.json();
      current = lang;
      save(lang);
      apply();
      updateSwitcher();
    } catch (e) {
      console.warn("[DvLang] Failed to load language:", lang, e);
    }
  }

  function apply() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      const key = el.getAttribute("data-i18n");
      const val = resolve(key);
      if (val !== undefined && val !== null) {
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          el.placeholder = val;
        } else {
          el.textContent = val;
        }
      }
    });
  }

  function resolve(key) {
    const parts = key.split(".");
    let obj = translations;
    for (const p of parts) {
      if (obj && typeof obj === "object" && p in obj) {
        obj = obj[p];
      } else {
        return undefined;
      }
    }
    return obj;
  }

  function t(key) {
    return resolve(key) || key;
  }

  function updateSwitcher() {
    document.querySelectorAll(".dv-lang-btn").forEach(function (btn) {
      const lang = btn.getAttribute("data-lang");
      btn.classList.toggle("active", lang === current);
    });
  }

  function initSwitcher() {
    document.addEventListener("click", function (e) {
      const btn = e.target.closest(".dv-lang-btn");
      if (!btn) return;
      const lang = btn.getAttribute("data-lang");
      if (lang && lang !== current) {
        load(lang);
      }
    });
  }

  function getCurrent() {
    return current;
  }

  async function init() {
    current = getSaved();
    initSwitcher();
    await load(current);
  }

  return { init: init, load: load, t: t, getCurrent: getCurrent, apply: apply };
})();
