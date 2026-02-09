export const createMainContentLayer = () => {
  const node = document.getElementById("main-content");
  if (!node) return null;
  node.classList.add("app-layout-main-content");
  return node;
};
