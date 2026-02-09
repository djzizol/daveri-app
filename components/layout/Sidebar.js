export const createSidebarLayer = () => {
  const node = document.getElementById("daveri_sidebar");
  if (!node) return null;
  node.classList.add("app-layout-sidebar");
  return node;
};
