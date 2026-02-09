const ICON_BASE_PATH = "/assets/icons";
const BADGE_MARKER = "data-daveri-powered";

export const createDaVeriPoweredBadge = ({ className = "", label = "Powered by" } = {}) => {
  const wrapper = document.createElement("div");
  wrapper.className = `daveri-powered${className ? ` ${className}` : ""}`;
  wrapper.setAttribute(BADGE_MARKER, "true");

  const text = document.createElement("span");
  text.textContent = label;

  const image = document.createElement("img");
  image.src = `${ICON_BASE_PATH}/poweredby.svg`;
  image.alt = "";
  image.className = "daveri-powered-image";
  image.width = 72;
  image.height = 72;
  image.decoding = "async";

  wrapper.appendChild(text);
  wrapper.appendChild(image);

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
