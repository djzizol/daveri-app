import { agentDockStore } from "../../js/agent-dock-store.js";
import { createDaVeriPoweredBadge } from "../brand/DaVeriPoweredBadge.js";
import { createAIMessages } from "./AIMessages.js";
import { createAIInput } from "./AIInput.js";

const AI_WINDOW_ID = "aiWindow";
const COLLAPSED_HEIGHT = 56;

const applyState = (windowNode, state) => {
  const targetHeight = state.isExpanded ? state.height : COLLAPSED_HEIGHT;
  windowNode.style.height = `${targetHeight}px`;
  windowNode.classList.toggle("is-expanded", state.isExpanded);
  windowNode.classList.toggle("is-collapsed", !state.isExpanded);
  document.documentElement.style.setProperty("--agent-dock-current-height", `${targetHeight}px`);
};

const createAIWindowNode = () => {
  const windowNode = document.createElement("section");
  windowNode.id = AI_WINDOW_ID;
  windowNode.className = "ai-window is-collapsed";

  const shell = document.createElement("div");
  shell.className = "ai-window-shell";

  const header = document.createElement("div");
  header.className = "ai-window-header";

  const headerBrand = document.createElement("div");
  headerBrand.className = "ai-window-brand";

  const title = document.createElement("span");
  title.className = "ai-window-title";
  title.textContent = "AI Assistant";

  const poweredBadge = createDaVeriPoweredBadge({ className: "ai-window-powered-badge" });

  headerBrand.appendChild(title);
  headerBrand.appendChild(poweredBadge);
  header.appendChild(headerBrand);

  const minimize = document.createElement("button");
  minimize.type = "button";
  minimize.className = "ai-window-minimize";
  minimize.setAttribute("aria-label", "Toggle AI window");
  minimize.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </svg>
  `;
  minimize.addEventListener("click", () => {
    const state = agentDockStore.getState();
    agentDockStore.setExpanded(!state.isExpanded);
  });

  const messagesWrap = document.createElement("div");
  messagesWrap.className = "ai-messages-wrap";

  const messages = createAIMessages();
  const input = createAIInput({
    onActivate: () => agentDockStore.setExpanded(true),
    onSend: (content) => {
      agentDockStore.addMessage({ role: "user", content });
      window.setTimeout(() => {
        agentDockStore.addMessage({
          role: "assistant",
          content: "Acknowledged. I can draft next steps, summarize this page, or generate implementation options.",
        });
      }, 220);
    },
  });

  messagesWrap.appendChild(messages.node);
  shell.appendChild(header);
  shell.appendChild(minimize);
  shell.appendChild(messagesWrap);
  shell.appendChild(input.node);
  windowNode.appendChild(shell);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const active = document.activeElement;
      if (active === input.input) {
        agentDockStore.setExpanded(false);
      }
    }
  });

  const sync = (state) => {
    applyState(windowNode, state);
    messages.render(state.messages);
    minimize.innerHTML = state.isExpanded
      ? `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>`
      : `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 12h12M12 6v12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>`;
    minimize.setAttribute("aria-label", state.isExpanded ? "Minimize AI window" : "Expand AI window");
  };

  sync(agentDockStore.getState());
  agentDockStore.subscribe(sync);

  return windowNode;
};

export const mountAIWindow = () => {
  const existing = document.getElementById(AI_WINDOW_ID);
  if (existing) return existing;

  const windowNode = createAIWindowNode();
  document.body.appendChild(windowNode);
  return windowNode;
};
