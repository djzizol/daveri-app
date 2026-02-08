const SUPPORTED_LANGS = ["en", "pl", "de", "fr", "es", "pt"];

export function getCurrentPathWithoutLang() {
  const path = window.location.pathname;
  const segments = path.split("/").filter(Boolean);

  if (segments.length === 0) return "";

  if (SUPPORTED_LANGS.includes(segments[0])) {
    segments.shift();
  }

  return segments.join("/");
}

export function redirectToLanguage(newLang) {
  if (!SUPPORTED_LANGS.includes(newLang)) {
    newLang = "en";
  }

  const pathWithoutLang = getCurrentPathWithoutLang();

  const newPath = pathWithoutLang ? `/${newLang}/${pathWithoutLang}` : `/${newLang}/`;

  window.location.href = newPath;
}
