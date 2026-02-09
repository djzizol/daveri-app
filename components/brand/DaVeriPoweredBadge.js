const ICON_BASE_PATH = "/assets/icons";
const BADGE_MARKER = "data-daveri-powered";

const createPoweredIcon = () => {
  const icon = document.createElement("div");
  icon.className = "daveri-powered-icon";

  const logo = document.createElement("img");
  logo.src = `${ICON_BASE_PATH}/logo.svg`;
  logo.alt = "";
  logo.width = 12;
  logo.height = 12;
  logo.decoding = "async";

  const overlay = document.createElement("img");
  overlay.src = `${ICON_BASE_PATH}/ai.svg`;
  overlay.alt = "";
  overlay.width = 8;
  overlay.height = 8;
  overlay.className = "ai-overlay";
  overlay.decoding = "async";

  icon.appendChild(logo);
  icon.appendChild(overlay);
  return icon;
};

export const createDaVeriPoweredBadge = ({ className = "", label = "Powered by DaVeri AI" } = {}) => {
  const wrapper = document.createElement("div");
  wrapper.className = `daveri-powered${className ? ` ${className}` : ""}`;
  wrapper.setAttribute(BADGE_MARKER, "true");

  const icon = createPoweredIcon();
  const text = document.createElement("span");
  text.textContent = label;

  wrapper.appendChild(icon);
  wrapper.appendChild(text);

  return wrapper;
};

export const mountDaVeriPoweredBadge = (container, options = {}) => {
  if (!container) return null;
  const { prepend = false, className = "", label } = options;

  const existing = container.querySelector(`[${BADGE_MARKER}]`);
  if (existing) return existing;

  const badge = createDaVeriPoweredBadge({ className, label });
  if (prepend) {
    container.prepend(badge);
  } else {
    container.appendChild(badge);
  }
  return badge;
};

