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

function closeAllLangMenus() {
  document.querySelectorAll("[data-lang-menu]").forEach((menu) => {
    menu.classList.remove("open");
  });
  document.querySelectorAll("[data-lang-dropdown]").forEach((container) => {
    container.classList.remove("is-open");
  });
}

function redirectToLang(lang) {
  const normalized = SUPPORTED.includes(lang) ? lang : "en";
  const languageApi = window.DaVeriLanguage;

  if (languageApi?.buildLanguageUrl) {
    const target = languageApi.buildLanguageUrl(normalized, {
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
    });
    window.location.assign(target);
    return;
  }

  const segments = window.location.pathname.split("/").filter(Boolean);
  if (SUPPORTED.includes(segments[0])) {
    segments.shift();
  }
  const newPath = segments.length
    ? `/${normalized}/${segments.join("/")}`
    : `/${normalized}/`;

  window.location.assign(newPath);
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
  const current = e.target.closest("[data-lang-current]");

  if (current) {
    const dropdown = current.closest("[data-lang-dropdown]");
    if (!dropdown) return;
    e.preventDefault();
    e.stopPropagation();
    const menu = dropdown.querySelector("[data-lang-menu]");
    if (!menu) return;
    const shouldOpen = !menu.classList.contains("open");
    closeAllLangMenus();
    if (!shouldOpen) return;
    dropdown.classList.add("is-open");
    menu.classList.toggle("open");
    return;
  }

  const option = e.target.closest(".language-option");

  if (option) {
    e.preventDefault();
    e.stopPropagation();
    const lang = option.dataset.lang;

    if (lang) {
      closeAllLangMenus();
      redirectToLang(lang);
    }

    return;
  }

  closeAllLangMenus();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeAllLangMenus();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  updateCurrentLangUI();
});

document.addEventListener("sidebar:mounted", () => {
  updateCurrentLangUI();
});
