const LANGS = {
  en: "English",
  pl: "Polski",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  pt: "Português"
};

const SUPPORTED = Object.keys(LANGS);

function getCurrentLang() {
  const path = window.location.pathname.split("/").filter(Boolean);

  if (SUPPORTED.includes(path[0])) return path[0];

  return "en";
}

function redirectToLang(lang) {
  const segments = window.location.pathname.split("/").filter(Boolean);

  if (SUPPORTED.includes(segments[0])) {
    segments.shift();
  }

  const newPath = segments.length
    ? `/${lang}/${segments.join("/")}`
    : `/${lang}/`;

  window.location.href = newPath;
}

function updateCurrentLangUI() {
  const lang = getCurrentLang();

  document.querySelectorAll("[data-lang-current-flag]").forEach((el) => {
    el.src = `/assets/flags/${lang}.svg`;
  });

  document.querySelectorAll("[data-lang-current-label]").forEach((el) => {
    el.textContent = LANGS[lang];
  });
}

document.addEventListener("click", (e) => {
  const dropdown = e.target.closest("[data-lang-dropdown]");

  if (e.target.closest("[data-lang-current]")) {
    if (!dropdown) return;
    const menu = dropdown.querySelector("[data-lang-menu]");
    if (!menu) return;
    menu.classList.toggle("open");
    return;
  }

  const option = e.target.closest(".lang-option");

  if (option) {
    const lang = option.dataset.lang;

    if (lang) {
      redirectToLang(lang);
    }

    return;
  }

  document.querySelectorAll("[data-lang-menu]").forEach((menu) =>
    menu.classList.remove("open")
  );
});

document.addEventListener("DOMContentLoaded", () => {
  updateCurrentLangUI();
});

document.addEventListener("sidebar:mounted", () => {
  updateCurrentLangUI();
});
