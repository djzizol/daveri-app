import { redirectToLanguage } from "./lang-routing.js";

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".lang-btn");

  if (!btn) return;

  const lang = btn.dataset.lang;

  redirectToLanguage(lang);
});
