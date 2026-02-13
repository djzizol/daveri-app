(function () {
  "use strict";

  const scriptEl =
    document.currentScript ||
    Array.from(document.querySelectorAll("script[src]")).find((node) =>
      /\/widget\.js(\?|$)/i.test(node.getAttribute("src") || "")
    );

  const API_BASE = String(scriptEl?.getAttribute("data-api-base") || "https://<MOJA-DOMENA-API>")
    .trim()
    .replace(/\/+$/, "");
  const BOT_ID = String(scriptEl?.getAttribute("data-bot-id") || "").trim();
  const POSITION = String(scriptEl?.getAttribute("data-position") || "bottom-right").trim().toLowerCase();
  const ROOT_ID = "chatekai-widget-root";
  const SESSION_KEY = "chatekai_session_id";
  const USER_KEY_NAME = "chatekai_user_id";

  if (document.getElementById(ROOT_ID)) return;

  const scriptUrl = (() => {
    try {
      if (scriptEl?.src) return new URL(scriptEl.src, window.location.href);
    } catch {}
    return new URL(window.location.href);
  })();
  const ASSET_ORIGIN = scriptUrl.origin;
  const LOGO_URL = new URL("/assets/icons/logo.svg", ASSET_ORIGIN).toString();

  const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);

  const parseJsonSafe = (value, fallback = null) => {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  };

  const sanitizeText = (value) => String(value == null ? "" : value).trim();
  const isDevRuntime = () => {
    const host = String(window?.location?.hostname || "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local") || host.endsWith(".test");
  };

  const isDark = (hex) => {
    if (!hex || typeof hex !== "string") return false;
    const h = hex.replace("#", "");
    if (h.length < 6) return false;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq < 140;
  };

  const pickAnswer = (payload) => {
    if (typeof payload === "string") return payload;
    if (!isObject(payload)) return "";
    const candidates = [payload.answer, payload.output, payload.reply, payload.message];
    for (const candidate of candidates) {
      if (typeof candidate === "string") return candidate;
      if (candidate !== null && candidate !== undefined && typeof candidate !== "object") {
        return String(candidate);
      }
    }
    return "";
  };

  const pickConversationId = (payload) => {
    if (!isObject(payload)) return null;
    const candidate = payload.conversation_id ?? payload.conversationId ?? null;
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    return null;
  };

  const getSessionId = () => {
    try {
      let sessionId = window.localStorage.getItem(SESSION_KEY);
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        window.localStorage.setItem(SESSION_KEY, sessionId);
      }
      return sessionId;
    } catch {
      return null;
    }
  };

  const getUserKey = () => {
    try {
      const existing = window.localStorage.getItem(USER_KEY_NAME);
      if (existing) return existing;
      const generated = `u_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      window.localStorage.setItem(USER_KEY_NAME, generated);
      return generated;
    } catch {
      return "guest";
    }
  };

  const mapAppearanceToWidget = (appearanceWork) => {
    if (!isObject(appearanceWork)) return {};
    const colors = isObject(appearanceWork.colors) ? appearanceWork.colors : {};

    return {
      botName: sanitizeText(appearanceWork.botName) || "Chatbot",
      botStatus: "Online • odpowiada natychmiast",
      welcomeText: "Cześć! 👋 W czym mogę pomóc?",
      accent: sanitizeText(colors.chatAccent),
      bg: sanitizeText(colors.chatBackground),
      bot: sanitizeText(colors.botBubble),
      user: sanitizeText(colors.userBubble),
      botText: sanitizeText(colors.botText),
      userText: sanitizeText(colors.userText),
      radius: Number.isFinite(Number(appearanceWork.windowRadius))
        ? Number(appearanceWork.windowRadius)
        : null,
      avatarUrl: sanitizeText(appearanceWork.avatarImage),
      iconImage: sanitizeText(appearanceWork.iconImage),
      iconShape: sanitizeText(appearanceWork.iconShape),
      iconSize: Number.isFinite(Number(appearanceWork.iconSize)) ? Number(appearanceWork.iconSize) : null,
    };
  };

  const mountStyle = () => {
    const style = document.createElement("style");
    style.textContent = `
#${ROOT_ID}{
  position:fixed;
  right:20px;
  bottom:20px;
  z-index:2147483647;
  --primary:#7c3aed;
  --primary2:#a855f7;
  --bg:#0f172a;
  --bot:#1e293b;
  --user:#7c3aed;
  --userText:#ffffff;
  --botText:#e2e8f0;
  --radius:18px;
  --shadow:0 20px 60px rgba(15,23,42,.45);
  --border:rgba(255,255,255,.12);
}
#${ROOT_ID}.ck-left{
  right:auto;
  left:20px;
}
#${ROOT_ID} *{
  box-sizing:border-box;
  font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;
}
#${ROOT_ID} .ck-window{
  position:absolute;
  right:0;
  bottom:68px;
  width:360px;
  max-width:100vw;
  height:520px;
  max-height:calc(100vh - 100px);
  border-radius:var(--radius);
  border:1px solid var(--border);
  background:#0b1220;
  box-shadow:var(--shadow);
  display:flex;
  flex-direction:column;
  overflow:hidden;
}
#${ROOT_ID} .ck-header{
  padding:12px 14px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  border-bottom:1px solid rgba(255,255,255,.08);
  background:rgba(255,255,255,.04);
}
#${ROOT_ID} .ck-head-main{
  display:flex;
  align-items:center;
  gap:10px;
  min-width:0;
}
#${ROOT_ID} .ck-ava{
  width:30px;
  height:30px;
  border-radius:10px;
  background:linear-gradient(135deg,var(--primary),var(--primary2));
  display:flex;
  align-items:center;
  justify-content:center;
  color:#fff;
  font-weight:900;
  box-shadow:0 10px 26px rgba(79,70,229,.35);
  overflow:hidden;
  flex-shrink:0;
}
#${ROOT_ID} .ck-ava img{
  width:100%;
  height:100%;
  object-fit:cover;
  display:none;
}
#${ROOT_ID} .ck-head-text{
  display:flex;
  flex-direction:column;
  gap:2px;
  min-width:0;
}
#${ROOT_ID} .ck-head-title{
  font-size:13px;
  font-weight:900;
  color:#f8fafc;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
#${ROOT_ID} .ck-head-sub{
  font-size:11px;
  font-weight:700;
  color:#94a3b8;
}
#${ROOT_ID} .ck-close{
  width:28px;
  height:28px;
  border-radius:10px;
  border:1px solid rgba(255,255,255,.12);
  background:#111827;
  cursor:pointer;
  display:flex;
  align-items:center;
  justify-content:center;
  font-weight:900;
  color:#cbd5e1;
  flex-shrink:0;
}
#${ROOT_ID} .ck-close:hover{
  background:#1f2937;
}
#${ROOT_ID} .ck-messages{
  flex:1;
  padding:12px;
  overflow-y:auto;
  background:var(--bg);
}
#${ROOT_ID} .ck-row{
  display:flex;
  margin-bottom:8px;
}
#${ROOT_ID} .ck-row.bot{
  justify-content:flex-start;
}
#${ROOT_ID} .ck-row.user{
  justify-content:flex-end;
}
#${ROOT_ID} .ck-msg{
  max-width:82%;
  padding:9px 11px;
  border-radius:16px;
  font-size:13px;
  line-height:1.35;
  box-shadow:0 10px 24px rgba(15,23,42,.18);
  border:1px solid rgba(226,232,240,.22);
  word-wrap:break-word;
  white-space:pre-wrap;
}
#${ROOT_ID} .ck-row.bot .ck-msg{
  background:var(--bot);
  color:var(--botText);
  border-top-left-radius:10px;
}
#${ROOT_ID} .ck-row.user .ck-msg{
  background:var(--user);
  color:var(--userText);
  border-top-right-radius:10px;
  border-color:rgba(0,0,0,.16);
}
#${ROOT_ID} .ck-system{
  margin:4px 0 10px;
  font-size:11px;
  color:#fca5a5;
}
#${ROOT_ID} .ck-footer{
  padding:10px;
  border-top:1px solid rgba(255,255,255,.08);
  background:rgba(255,255,255,.04);
  display:flex;
  gap:8px;
  align-items:center;
}
#${ROOT_ID} .ck-input{
  flex:1;
  height:40px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.12);
  background:#111827;
  color:#f8fafc;
  padding:0 11px;
  font-size:13px;
  outline:none;
}
#${ROOT_ID} .ck-input::placeholder{
  color:#94a3b8;
}
#${ROOT_ID} .ck-input:focus{
  border-color:rgba(124,58,237,.55);
  box-shadow:0 0 0 1px rgba(124,58,237,.35);
}
#${ROOT_ID} .ck-send{
  width:40px;
  height:40px;
  border-radius:12px;
  border:none;
  cursor:pointer;
  background:linear-gradient(135deg,var(--primary),var(--primary2));
  color:#fff;
  font-weight:900;
  display:flex;
  align-items:center;
  justify-content:center;
  box-shadow:0 14px 30px rgba(79,70,229,.45);
  flex-shrink:0;
}
#${ROOT_ID} .ck-send[disabled]{
  opacity:.6;
  cursor:default;
  box-shadow:none;
}
#${ROOT_ID} .ck-launcher{
  position:absolute;
  right:0;
  bottom:0;
  width:56px;
  height:56px;
  border-radius:18px;
  border:1px solid rgba(124,58,237,.45);
  background:linear-gradient(135deg,var(--primary),var(--primary2));
  display:flex;
  align-items:center;
  justify-content:center;
  color:#fff;
  box-shadow:var(--shadow);
  cursor:pointer;
  overflow:hidden;
}
#${ROOT_ID} .ck-launcher img{
  width:100%;
  height:100%;
  object-fit:cover;
}
#${ROOT_ID}[data-state="closed"] .ck-window{ display:none; }
#${ROOT_ID}[data-state="open"] .ck-window{ display:flex; }
@media (max-width:480px){
  #${ROOT_ID}{ right:10px; left:10px; }
  #${ROOT_ID}.ck-left{ left:10px; right:10px; }
  #${ROOT_ID} .ck-window{
    right:0;
    left:0;
    width:auto;
    height:70vh;
    max-height:calc(100vh - 80px);
  }
}
`;
    document.head.appendChild(style);
  };

  const mountMarkup = () => {
    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("data-state", "closed");
    root.setAttribute("data-bot-id", BOT_ID);
    root.classList.toggle("ck-left", POSITION === "left" || POSITION === "bottom-left");
    root.innerHTML = `
<div class="ck-window">
  <div class="ck-header">
    <div class="ck-head-main">
      <div class="ck-ava">
        <span id="ckAvaLetter">D</span>
        <img id="ckAvaImg" alt="">
      </div>
      <div class="ck-head-text">
        <div class="ck-head-title" id="ckBotName">DaVeri Assistant</div>
        <div class="ck-head-sub" id="ckBotStatus">Online • odpowiada natychmiast</div>
      </div>
    </div>
    <button id="ckClose" class="ck-close" type="button">X</button>
  </div>
  <div class="ck-messages" id="ckMessages"></div>
  <div class="ck-footer">
    <input id="ckInput" class="ck-input" placeholder="Napisz wiadomość…" />
    <button id="ckSend" class="ck-send" type="button">➤</button>
  </div>
</div>
<button id="ckLauncher" class="ck-launcher" type="button" aria-label="Otwórz czat">
  <img src="${LOGO_URL}" alt="Chat launcher">
</button>`;
    document.body.appendChild(root);
    return root;
  };

  mountStyle();
  const root = mountMarkup();

  const messagesEl = root.querySelector("#ckMessages");
  const inputEl = root.querySelector("#ckInput");
  const sendBtn = root.querySelector("#ckSend");
  const launcher = root.querySelector("#ckLauncher");
  const closeBtn = root.querySelector("#ckClose");
  const headName = root.querySelector("#ckBotName");
  const headStatus = root.querySelector("#ckBotStatus");
  const avaLetter = root.querySelector("#ckAvaLetter");
  const avaImg = root.querySelector("#ckAvaImg");

  const state = {
    botId: BOT_ID,
    visitorId: getUserKey(),
    conversationId: getSessionId(),
    messages: [],
  };

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight + 100;
    });
  };

  const renderMessages = () => {
    messagesEl.innerHTML = "";
    state.messages.forEach((msg) => {
      const row = document.createElement("div");
      row.className = `ck-row ${msg.role}`;
      const bubble = document.createElement("div");
      bubble.className = "ck-msg";
      bubble.textContent = msg.text;
      row.appendChild(bubble);
      messagesEl.appendChild(row);
    });
    scrollToBottom();
  };

  const addMessage = (role, text) => {
    state.messages.push({ role, text });
    renderMessages();
  };

  const applyWidgetConfig = (cfg) => {
    if (!isObject(cfg)) return;

    if (cfg.accent) {
      root.style.setProperty("--primary", cfg.accent);
      root.style.setProperty("--primary2", cfg.accent);
    }
    if (cfg.bg) root.style.setProperty("--bg", cfg.bg);
    if (cfg.bot) root.style.setProperty("--bot", cfg.bot);
    if (cfg.user) root.style.setProperty("--user", cfg.user);
    if (cfg.botText) root.style.setProperty("--botText", cfg.botText);
    if (cfg.userText) root.style.setProperty("--userText", cfg.userText);

    const userCol = cfg.user || "#7c3aed";
    const botCol = cfg.bot || "#1e293b";
    if (!cfg.userText) root.style.setProperty("--userText", isDark(userCol) ? "#ffffff" : "#111827");
    if (!cfg.botText) root.style.setProperty("--botText", isDark(botCol) ? "#ffffff" : "#111827");

    if (Number.isFinite(cfg.radius)) {
      root.style.setProperty("--radius", `${Math.max(8, Number(cfg.radius))}px`);
    }

    if (typeof cfg.shadow === "number" && Number.isFinite(cfg.shadow)) {
      root.style.setProperty("--shadow", `0 20px ${Math.max(20, cfg.shadow * 2)}px rgba(15,23,42,.42)`);
    }

    const position = String(cfg.pos || cfg.position || POSITION || "").trim().toLowerCase();
    const placeLeft = position === "left" || position === "bottom-left" || position === "top-left";
    root.classList.toggle("ck-left", placeLeft);

    const botName = sanitizeText(cfg.botName);
    if (botName) {
      headName.textContent = botName;
      avaLetter.textContent = botName[0].toUpperCase();
    }

    const status = sanitizeText(cfg.botStatus);
    if (status) headStatus.textContent = status;

    const avatarUrl = sanitizeText(cfg.avatarUrl);
    if (avatarUrl) {
      avaImg.src = avatarUrl;
      avaImg.style.display = "block";
      avaLetter.style.display = "none";
    }

    const iconImage = sanitizeText(cfg.iconImage);
    if (iconImage) {
      launcher.innerHTML = `<img src="${iconImage}" alt="Chat launcher">`;
    }
  };

  const extractWidgetConfig = (rawConfig) => {
    const config =
      typeof rawConfig === "string" ? parseJsonSafe(rawConfig, null) || rawConfig : rawConfig;
    if (!isObject(config)) return {};

    if (isObject(config.widget)) {
      return config.widget;
    }

    if (isObject(config.ready_config?.work)) {
      return mapAppearanceToWidget(config.ready_config.work);
    }

    if (isObject(config.appearance?.work)) {
      return mapAppearanceToWidget(config.appearance.work);
    }

    if (isObject(config.work)) {
      return mapAppearanceToWidget(config.work);
    }

    return {};
  };

  const askWidget = async (userText) => {
    const history = state.messages.map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.text,
    }));

    const widgetAskUrl = `${API_BASE}/v1/ask`;
    if (isDevRuntime()) {
      console.debug("[WIDGET ASK]", { url: widgetAskUrl });
    }

    const response = await fetch(widgetAskUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bot_id: state.botId,
        visitor_id: state.visitorId,
        conversation_id: state.conversationId,
        message: userText,
        history,
      }),
    });

    const rawText = await response.text();
    const parsed = parseJsonSafe(rawText, null);
    if (!response.ok) {
      const details =
        typeof parsed === "string"
          ? parsed
          : isObject(parsed) || Array.isArray(parsed)
            ? JSON.stringify(parsed)
            : rawText || `HTTP ${response.status}`;
      throw new Error(details);
    }

    return {
      answer: pickAnswer(parsed || rawText),
      conversationId: pickConversationId(parsed),
    };
  };

  let sending = false;
  const sendMessage = async () => {
    if (sending) return;
    if (!state.botId) {
      addMessage("bot", "Brakuje bot_id. Uzupełnij atrybut data-bot-id w snippecie.");
      return;
    }

    const text = sanitizeText(inputEl.value);
    if (!text) return;

    sending = true;
    inputEl.value = "";
    inputEl.focus();
    addMessage("user", text);

    const pendingIdx = state.messages.length;
    addMessage("bot", "…");
    sendBtn.disabled = true;

    try {
      const result = await askWidget(text);
      if (result.conversationId) {
        state.conversationId = result.conversationId;
      }
      const answer = sanitizeText(result.answer) || "Brak odpowiedzi z API.";
      state.messages[pendingIdx].text = answer;
      renderMessages();

      if (typeof window.widget_onAssistantMessage === "function") {
        try {
          window.widget_onAssistantMessage({ reply: answer });
        } catch {}
      }
    } catch (error) {
      state.messages[pendingIdx].text = "Nie udało się pobrać odpowiedzi. Spróbuj ponownie później.";
      renderMessages();
      console.error("[DaVeri Widget] ask failed:", error);
    } finally {
      sending = false;
      sendBtn.disabled = false;
    }
  };

  const loadBotConfig = async () => {
    if (!state.botId) {
      headName.textContent = "Chatbot";
      headStatus.textContent = "Offline • brak bot_id";
      addMessage("bot", "Cześć! 👋 Brakuje bot_id w snippecie instalacyjnym.");
      inputEl.disabled = true;
      sendBtn.disabled = true;
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/v1/bots/${encodeURIComponent(state.botId)}/config`, {
        method: "GET",
      });
      const rawText = await response.text();
      const payload = parseJsonSafe(rawText, null);
      if (!response.ok) {
        throw new Error(rawText || `HTTP ${response.status}`);
      }

      const configValue = isObject(payload) ? payload.config : null;
      const widgetCfg = extractWidgetConfig(configValue);
      applyWidgetConfig(widgetCfg);

      if (isObject(configValue) && sanitizeText(configValue.botName) && !sanitizeText(widgetCfg.botName)) {
        headName.textContent = sanitizeText(configValue.botName);
      }

      const hello =
        sanitizeText(widgetCfg.welcomeText) ||
        (isObject(configValue) && sanitizeText(configValue.welcomeText)) ||
        "Cześć! 👋 W czym mogę pomóc?";
      addMessage("bot", hello);
    } catch (error) {
      console.error("[DaVeri Widget] config load failed:", error);
      addMessage("bot", "Cześć! 👋 Nie udało się pobrać konfiguracji bota. Używam ustawień domyślnych.");
    }
  };

  root.setAttribute("data-state", "closed");
  launcher.addEventListener("click", () => root.setAttribute("data-state", "open"));
  closeBtn.addEventListener("click", () => root.setAttribute("data-state", "closed"));
  sendBtn.addEventListener("click", sendMessage);
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  const sessionCheck = getSessionId();
  if (sessionCheck) {
    console.log("[DaVeri Widget] session_id:", sessionCheck);
  }

  loadBotConfig();
})();
