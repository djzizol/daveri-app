import { agentDockStore } from "../../js/agent-dock-store.js";
import { createAgentDockHeader } from "./AgentDockHeader.js";
import { createAgentMessagesContainer } from "./AgentMessagesContainer.js";
import { createAgentInputContainer } from "./AgentInputContainer.js";

const AGENT_DOCK_ID = "agentDock";
const MINIMIZED_HEIGHT = 56;

const applyDockHeight = (dock, state) => {
  const currentHeight = state.isExpanded ? state.height : MINIMIZED_HEIGHT;
  dock.style.height = `${currentHeight}px`;
  document.documentElement.style.setProperty("--agent-dock-current-height", `${currentHeight}px`);
  dock.classList.toggle("is-collapsed", !state.isExpanded);
};

const startResize = (dock, pointerDownEvent) => {
  if (pointerDownEvent.button !== 0) return;
  pointerDownEvent.preventDefault();

  const startY = pointerDownEvent.clientY;
  const startHeight = agentDockStore.getState().height;

  const onMove = (moveEvent) => {
    const delta = startY - moveEvent.clientY;
    agentDockStore.setExpanded(true);
    agentDockStore.setHeight(startHeight + delta);
  };

  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
};

const createDockNode = () => {
  const dock = document.createElement("section");
  dock.id = AGENT_DOCK_ID;
  dock.className = "agent-dock";

  const resizeHandle = document.createElement("button");
  resizeHandle.type = "button";
  resizeHandle.className = "agent-dock-resize-handle";
  resizeHandle.setAttribute("aria-label", "Resize AI Assistant panel");
  resizeHandle.addEventListener("pointerdown", (event) => startResize(dock, event));

  const header = createAgentDockHeader({
    getExpanded: () => agentDockStore.getState().isExpanded,
    onToggle: () => agentDockStore.setExpanded(!agentDockStore.getState().isExpanded),
  });

  const messages = createAgentMessagesContainer();
  const input = createAgentInputContainer({
    onSend: (content) => {
      agentDockStore.addMessage({ role: "user", content });
      window.setTimeout(() => {
        agentDockStore.addMessage({
          role: "assistant",
          content: "Action noted. I can draft next steps, generate a prompt, or summarize this page.",
        });
      }, 260);
    },
  });

  dock.appendChild(resizeHandle);
  dock.appendChild(header.node);
  dock.appendChild(messages.node);
  dock.appendChild(input.node);

  const sync = (state) => {
    applyDockHeight(dock, state);
    messages.render(state.messages);
    header.syncLabel();
  };

  sync(agentDockStore.getState());
  agentDockStore.subscribe(sync);

  return dock;
};

export const mountAgentDock = () => {
  const existing = document.getElementById(AGENT_DOCK_ID);
  if (existing) return existing;

  const dock = createDockNode();
  document.body.appendChild(dock);
  return dock;
};
