export const createAgentDockHeader = ({ getExpanded, onToggle }) => {
  const header = document.createElement("div");
  header.className = "agent-dock-header";

  const title = document.createElement("div");
  title.className = "agent-dock-title";
  title.textContent = "AI Assistant";

  const actions = document.createElement("div");
  actions.className = "agent-dock-actions";

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "agent-dock-toggle";

  const syncLabel = () => {
    toggleButton.textContent = getExpanded() ? "Minimize" : "Expand";
    toggleButton.setAttribute("aria-label", getExpanded() ? "Minimize AI Assistant" : "Expand AI Assistant");
  };

  toggleButton.addEventListener("click", () => {
    onToggle();
    syncLabel();
  });

  syncLabel();
  actions.appendChild(toggleButton);
  header.appendChild(title);
  header.appendChild(actions);

  return { node: header, syncLabel };
};
