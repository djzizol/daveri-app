const attachmentIcon = `
<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M21 12.5V7a5 5 0 0 0-10 0v10a3 3 0 0 0 6 0V8.5a1.5 1.5 0 0 0-3 0V16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const micIcon = `
<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M12 15a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M19 11v1a7 7 0 0 1-14 0v-1M12 19v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const sendIcon = `
<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M22 2 11 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M22 2 15 22l-4-9-9-4 20-7Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

export const createAIInput = ({ onSend, onActivate }) => {
  const row = document.createElement("div");
  row.className = "chat-input-row ai-input-row";

  const attachmentBtn = document.createElement("button");
  attachmentBtn.type = "button";
  attachmentBtn.className = "chat-icon-button ai-icon-btn";
  attachmentBtn.setAttribute("aria-label", "Attach file");
  attachmentBtn.innerHTML = attachmentIcon;

  const input = document.createElement("textarea");
  input.className = "chat-input ai-input";
  input.rows = 1;
  input.placeholder = "Ask AI anything...";

  const micBtn = document.createElement("button");
  micBtn.type = "button";
  micBtn.className = "chat-icon-button ai-icon-btn";
  micBtn.setAttribute("aria-label", "Voice input");
  micBtn.innerHTML = micIcon;

  const sendBtn = document.createElement("button");
  sendBtn.type = "button";
  sendBtn.className = "chat-icon-button send-button ai-send-btn";
  sendBtn.setAttribute("aria-label", "Send message");
  sendBtn.innerHTML = sendIcon;

  const submit = () => {
    const value = input.value.trim();
    if (!value) return;
    onSend(value);
    input.value = "";
    input.style.height = "44px";
  };

  const autoSize = () => {
    input.style.height = "44px";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  };

  row.addEventListener("click", onActivate);
  input.addEventListener("focus", onActivate);
  input.addEventListener("input", autoSize);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
    if (event.key === "Escape") {
      input.blur();
    }
  });

  sendBtn.addEventListener("click", () => {
    onActivate();
    submit();
  });

  row.appendChild(attachmentBtn);
  row.appendChild(input);
  row.appendChild(micBtn);
  row.appendChild(sendBtn);

  return { node: row, input };
};
