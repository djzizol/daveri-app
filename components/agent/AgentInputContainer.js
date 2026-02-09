export const createAgentInputContainer = ({ onSend }) => {
  const container = document.createElement("div");
  container.className = "agent-input-container";

  const textarea = document.createElement("textarea");
  textarea.className = "agent-input";
  textarea.rows = 1;
  textarea.placeholder = "Ask anything about your workspace...";

  const sendButton = document.createElement("button");
  sendButton.type = "button";
  sendButton.className = "agent-send";
  sendButton.textContent = "Send";

  const submit = () => {
    const text = textarea.value.trim();
    if (!text) return;
    onSend(text);
    textarea.value = "";
    textarea.style.height = "40px";
  };

  textarea.addEventListener("input", () => {
    textarea.style.height = "40px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
  });

  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  });

  sendButton.addEventListener("click", submit);

  container.appendChild(textarea);
  container.appendChild(sendButton);

  return { node: container };
};
