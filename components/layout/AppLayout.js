export const createAppLayout = () => {
  const pageWrapper = document.getElementById("page-wrapper");
  if (!pageWrapper) return null;
  pageWrapper.classList.add("app-layout");
  document.body.classList.add("app-layout-root");
  return pageWrapper;
};
