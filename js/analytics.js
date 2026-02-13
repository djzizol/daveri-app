export const trackEvent = (eventName, payload = {}) => {
  const name = typeof eventName === "string" ? eventName.trim() : "";
  if (!name) return false;

  const props = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  let tracked = false;

  try {
    if (typeof window?.DaVeriAnalytics?.track === "function") {
      window.DaVeriAnalytics.track(name, props);
      tracked = true;
    }
  } catch {}

  try {
    if (typeof window?.gtag === "function") {
      window.gtag("event", name, props);
      tracked = true;
    }
  } catch {}

  try {
    if (typeof window?.plausible === "function") {
      window.plausible(name, { props });
      tracked = true;
    }
  } catch {}

  try {
    if (Array.isArray(window?.dataLayer)) {
      window.dataLayer.push({
        event: name,
        ...props,
      });
      tracked = true;
    }
  } catch {}

  return tracked;
};

