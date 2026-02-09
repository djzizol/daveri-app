export const createAIMessages = () => {
  const container = document.createElement("div");
  container.className = "ai-messages";
  container.id = "aiMessages";

  const render = (messages) => {
    container.innerHTML = "";

    messages.forEach((message) => {
      const row = document.createElement("div");
      row.className = `ai-message-row ${message.role === "user" ? "ai-message-user" : "ai-message-assistant"}`;

      const bubble = document.createElement("div");
      bubble.className = "ai-message-bubble";
      bubble.textContent = message.content;

      row.appendChild(bubble);
      container.appendChild(row);
    });

    container.scrollTop = container.scrollHeight;
  };

  return { node: container, render };
};
