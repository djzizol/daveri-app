export const createStatsRow = (root) => {
  if (!root) return null;
  root.classList.add("stats-row");
  return root;
};
