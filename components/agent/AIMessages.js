export const createAIMessages = ({ onAction } = {}) => {
  const container = document.createElement("div");
  container.className = "ai-messages";
  container.id = "aiMessages";

  const getStatusLabel = (message) => {
    if (message?.status === "sending") return "sending...";
    if (message?.status === "failed") return "failed";
    return "";
  };

  const toActionTypeClass = (type) =>
    String(type || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-");

  const render = (messages) => {
    container.innerHTML = "";

    messages.forEach((message) => {
      const row = document.createElement("div");
      row.className = `ai-message-row ${message.role === "user" ? "ai-message-user" : "ai-message-assistant"}`;

      const bubble = document.createElement("div");
      bubble.className = "ai-message-bubble";
      bubble.textContent = message.content;

      row.appendChild(bubble);

      const statusLabel = getStatusLabel(message);
      const canRenderAction =
        message?.action &&
        typeof message.action === "object" &&
        typeof message.action.type === "string" &&
        typeof onAction === "function";

      if (statusLabel || canRenderAction) {
        const meta = document.createElement("div");
        meta.className = "ai-message-meta";

        if (statusLabel) {
          const statusNode = document.createElement("span");
          statusNode.className = `ai-message-status is-${message.status === "failed" ? "failed" : "sending"}`;
          statusNode.textContent = statusLabel;
          meta.appendChild(statusNode);
        }

        if (canRenderAction) {
          const actionButton = document.createElement("button");
          actionButton.type = "button";
          actionButton.className = "ai-message-action";
          actionButton.classList.add(`is-${toActionTypeClass(message.action.type)}`);
          actionButton.textContent =
            typeof message.action.label === "string" && message.action.label.trim()
              ? message.action.label.trim()
              : "Retry";
          actionButton.addEventListener("click", () => {
            onAction({
              message,
              action: message.action,
            });
          });
          meta.appendChild(actionButton);
        }

        row.appendChild(meta);
      }

      container.appendChild(row);
    });

    container.scrollTop = container.scrollHeight;
  };

  return { node: container, render };
};
