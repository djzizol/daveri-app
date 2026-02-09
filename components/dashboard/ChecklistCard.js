export const createChecklistCard = (root) => {
  if (!root) return null;
  root.classList.add("checklist-card");
  return root;
};
