const ICON_BASE_PATH = "/assets/icons";

const ROUTE_ICON_MAP = {
  panel: "logo",
  boty: "bot",
  historia: "history",
  prompt: "prompt",
  wyglad: "appearance",
  pliki: "files",
  instalacja: "prompt",
};

const getIconPath = (name) => `${ICON_BASE_PATH}/${name}.svg`;

export const createSidebarIcon = ({ name, alt = "" } = {}) => {
  const wrapper = document.createElement("div");
  wrapper.className = "sidebar-icon";
  wrapper.setAttribute("aria-hidden", "true");

  const image = document.createElement("img");
  image.src = getIconPath(name || "dashboard");
  image.alt = alt;
  image.width = 24;
  image.height = 24;
  image.decoding = "async";
  image.loading = "eager";
  image.className = "sidebar-icon-img";

  wrapper.appendChild(image);
  return wrapper;
};

const injectSidebarIcon = (item, iconName) => {
  if (!item || !iconName) return;

  const existing = item.querySelector(".sidebar-icon");
  if (existing) {
    const existingImg = existing.querySelector("img");
    if (existingImg) {
      existingImg.src = getIconPath(iconName);
      existingImg.width = 24;
      existingImg.height = 24;
      existingImg.classList.add("sidebar-icon-img");
      return;
    }

    existing.innerHTML = "";
    existing.appendChild(createSidebarIcon({ name: iconName }).firstElementChild);
    return;
  }

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
    item.removeAttribute("data-gradient");
    injectSidebarIcon(item, iconName);
  });
};
