const ICON_BASE_PATH = "/assets/icons";

const ICON_FILE_MAP = {
  ai: "ai.svg",
  appearance: "appearance.svg",
  bot: "bot.svg",
  dashboard: "dashboard.svg",
  files: "files.svg",
  history: "history.svg",
  install: "install.svg",
  prompt: "prompt.svg",
  settings: "settings.svg",
};

const ROUTE_ICON_MAP = {
  panel: "dashboard",
  boty: "bot",
  historia: "history",
  prompt: "prompt",
  wyglad: "appearance",
  pliki: "files",
  instalacja: "install",
  settings: "settings",
};

const ROUTE_GRADIENT_MAP = {
  panel: "primary",
  boty: "green",
  historia: "orange",
  prompt: "purple",
  wyglad: "purple",
  pliki: "blue",
  instalacja: "primary",
  settings: "neutral",
};

const getIconPath = (name) => {
  const fileName = ICON_FILE_MAP[name] || `${name}.svg`;
  return `${ICON_BASE_PATH}/${fileName}`;
};

export const createSidebarIcon = ({ name, alt = "" } = {}) => {
  const wrapper = document.createElement("div");
  wrapper.className = "sidebar-icon";

  const image = document.createElement("img");
  image.src = getIconPath(name || "settings");
  image.alt = alt;
  image.width = 14;
  image.height = 14;
  image.decoding = "async";

  wrapper.appendChild(image);
  return wrapper;
};

const injectSidebarIcon = (item, iconName) => {
  if (!item || !iconName) return;

  const existing = item.querySelector(".sidebar-icon");
  if (existing) return;

  const legacyIcon = item.querySelector(".nav-ico");
  const label = item.querySelector(".label");
  const icon = createSidebarIcon({ name: iconName });

  if (legacyIcon) {
    legacyIcon.remove();
  }

  if (label) {
    item.insertBefore(icon, label);
  } else {
    item.prepend(icon);
  }
};

export const mountSidebarIcons = (root) => {
  if (!root) return;

  const navItems = root.querySelectorAll(".nav-item[data-route]");
  navItems.forEach((item) => {
    const route = item.dataset.route;
    const iconName = ROUTE_ICON_MAP[route];
    if (!iconName) return;

    item.classList.add("sidebar-item");
    item.dataset.gradient = ROUTE_GRADIENT_MAP[route] || "primary";
    injectSidebarIcon(item, iconName);
  });
};
