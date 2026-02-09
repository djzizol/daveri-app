const SUPPORTED = ["en", "pl", "de", "fr", "es", "pt"];

function getPathWithoutLang() {
  const segments = window.location.pathname.split("/").filter(Boolean);

  if (segments.length === 0) return "";

  if (SUPPORTED.includes(segments[0])) {
    segments.shift();
  }

  return segments.join("/");
}

export function redirectToLanguage(lang) {
  if (!SUPPORTED.includes(lang)) lang = "en";

  const path = getPathWithoutLang();

  const newPath = path
    ? `/${lang}/${path}`
    : `/${lang}/`;

  window.location.href = newPath;
}
