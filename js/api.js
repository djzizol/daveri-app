const resolveApiOrigin = () => {
  if (typeof window === "undefined") {
    return "https://api.daveri.io";
  }

  if (typeof window.DaVeriApiOrigin === "string" && window.DaVeriApiOrigin.trim()) {
    return window.DaVeriApiOrigin.trim().replace(/\/$/, "");
  }

  const host = window.location.hostname.toLowerCase();
  if (host === "api.daveri.io") return "";
  if (host === "daveri.io" || host.endsWith(".daveri.io")) return "https://api.daveri.io";
  return "https://api.daveri.io";
};

export const getApiUrl = (path = "") => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const origin = resolveApiOrigin();
  return origin ? `${origin}${normalizedPath}` : normalizedPath;
};
