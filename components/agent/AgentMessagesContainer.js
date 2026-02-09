import { createAgentMessage } from "./AgentMessage.js";

export const createAgentMessagesContainer = () => {
  const container = document.createElement("div");
  container.className = "agent-messages-container";
  container.id = "agentMessagesContainer";

  const render = (messages) => {
    container.innerHTML = "";
    messages.forEach((message) => container.appendChild(createAgentMessage(message)));
    container.scrollTop = container.scrollHeight;
  };

  return { node: container, render };
};
