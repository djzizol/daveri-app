export const createAgentMessage = (message) => {
  const item = document.createElement("div");
  item.className = `agent-message ${message.role === "user" ? "agent-message-user" : "agent-message-assistant"}`;

  const bubble = document.createElement("div");
  bubble.className = "agent-message-bubble";
  bubble.textContent = message.content;

  item.appendChild(bubble);
  return item;
};
