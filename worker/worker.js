const SESSION_COOKIE = "session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_APP_ORIGIN = "https://daveri.io";
const DEFAULT_API_ORIGIN = "https://api.daveri.io";

const jsonResponse = (payload, status = 200, cors = {}, extraHeaders = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...cors,
      ...extraHeaders,
    },
  });

const textResponse = (payload, status = 200, cors = {}, extraHeaders = {}) =>
  new Response(payload, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      ...cors,
      ...extraHeaders,
    },
  });

const parseJsonSafe = (value, fallback = null) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const encodeBase64Utf8 = (value) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

const decodeBase64Utf8 = (value) => {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
};

const getCookieValue = (cookieHeader, name) => {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (!part.startsWith(`${name}=`)) continue;
    return part.slice(name.length + 1);
  }
  return null;
};

const getSessionFromCookie = (request) => {
  const cookieHeader = request.headers.get("Cookie") || "";
  const encoded = getCookieValue(cookieHeader, SESSION_COOKIE);
  if (!encoded) return null;

  const decoded = decodeBase64Utf8(encoded);
  if (!decoded) return null;

  const parsed = parseJsonSafe(decoded, null);
  if (!parsed || typeof parsed !== "object") return null;
  return parsed;
};

const deriveDisplayName = (email) => {
  if (!email || typeof email !== "string") return "User";
  const localPart = email.split("@")[0] || "User";
  return localPart
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "User";
};

const isAllowedOrigin = (origin) => {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (host === "daveri.io" || host.endsWith(".daveri.io")) return true;
    return false;
  } catch {
    return false;
  }
};

const buildCorsHeaders = (request) => {
  const origin = request.headers.get("Origin");
  const allowOrigin = isAllowedOrigin(origin) ? origin : DEFAULT_APP_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Expose-Headers": "Set-Cookie",
    Vary: "Origin",
  };
};

const getCookieDomain = (hostname) => {
  const host = (hostname || "").toLowerCase();
  if (!host) return "daveri.io";
  if (host === "localhost" || host === "127.0.0.1") return host;
  if (host === "daveri.io" || host.endsWith(".daveri.io")) return ".daveri.io";
  return host;
};

const buildSessionCookie = (session, requestUrl, maxAge = SESSION_MAX_AGE_SECONDS) => {
  const url = new URL(requestUrl);
  const value = encodeBase64Utf8(JSON.stringify(session));
  const domain = getCookieDomain(url.hostname);

  const secureFlag = url.protocol === "https:" ? "; Secure" : "";
  return (
    `${SESSION_COOKIE}=${value}; Domain=${domain}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}` +
    secureFlag
  );
};

const buildExpiredSessionCookie = (requestUrl) => buildSessionCookie({}, requestUrl, 0);

const supabaseHeaders = (env, extraHeaders = {}) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  ...extraHeaders,
});

const supabaseRequest = async (env, path, options = {}) => {
  const url = `${env.SUPABASE_URL}${path}`;
  const headers = supabaseHeaders(env, options.headers || {});
  const response = await fetch(url, { ...options, headers });

  let data = null;
  if ((options.method || "GET").toUpperCase() !== "HEAD") {
    const raw = await response.text();
    if (raw) {
      data = parseJsonSafe(raw, raw);
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    response,
  };
};

const parseCountFromContentRange = (response) => {
  const header = response.headers.get("Content-Range");
  if (!header) return null;
  const slashIndex = header.lastIndexOf("/");
  if (slashIndex === -1) return null;
  const rawCount = header.slice(slashIndex + 1);
  const count = Number(rawCount);
  return Number.isFinite(count) ? count : null;
};

const clampInt = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

let cachedDefaultPlanId;

const getDefaultPlanId = async (env) => {
  if (cachedDefaultPlanId !== undefined) return cachedDefaultPlanId;

  const params = new URLSearchParams({
    select: "id,price",
    order: "price.asc",
    limit: "1",
  });
  const result = await supabaseRequest(env, `/rest/v1/plans?${params.toString()}`);
  if (result.ok && Array.isArray(result.data) && result.data[0]?.id) {
    cachedDefaultPlanId = result.data[0].id;
    return cachedDefaultPlanId;
  }

  cachedDefaultPlanId = null;
  return cachedDefaultPlanId;
};

const fetchUserById = async (env, id) => {
  if (!id) return null;
  const params = new URLSearchParams({
    select: "id,email,created_at,messages_used,plan_id,plan_status,trial_ends_at",
    id: `eq.${id}`,
    limit: "1",
  });
  const result = await supabaseRequest(env, `/rest/v1/users?${params.toString()}`);
  if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) return null;
  return result.data[0];
};

const fetchUserByEmail = async (env, email) => {
  if (!email) return null;
  const params = new URLSearchParams({
    select: "id,email,created_at,messages_used,plan_id,plan_status,trial_ends_at",
    email: `eq.${email}`,
    limit: "1",
  });
  const result = await supabaseRequest(env, `/rest/v1/users?${params.toString()}`);
  if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) return null;
  return result.data[0];
};

const createUserRecord = async (env, email) => {
  const defaultPlanId = await getDefaultPlanId(env);
  const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const payload = {
    id: crypto.randomUUID(),
    email,
    plan_status: "trial",
    messages_used: 0,
    trial_ends_at: trialEndsAt,
  };
  if (defaultPlanId) {
    payload.plan_id = defaultPlanId;
  }

  const result = await supabaseRequest(env, "/rest/v1/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  if (!result.ok) return null;
  if (!Array.isArray(result.data) || result.data.length === 0) return null;
  return result.data[0];
};

const getOrCreateUser = async (env, session) => {
  if (!session?.email) return null;

  let user = null;
  if (session.id) {
    user = await fetchUserById(env, session.id);
  }
  if (!user) {
    user = await fetchUserByEmail(env, session.email);
  }
  if (user) return user;

  user = await createUserRecord(env, session.email);
  if (user) return user;

  return await fetchUserByEmail(env, session.email);
};

const fetchPlanById = async (env, planId) => {
  if (!planId) return null;
  const params = new URLSearchParams({
    select:
      "id,price,bots_limit,files_limit,messages_limit,avatar_allowed,branding_allowed,embed_allowed",
    id: `eq.${planId}`,
    limit: "1",
  });
  const result = await supabaseRequest(env, `/rest/v1/plans?${params.toString()}`);
  if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) return null;
  return result.data[0];
};

const buildPlanSummary = (user, plan) => {
  const used = Number(user?.messages_used ?? 0);
  const safeUsed = Number.isFinite(used) ? Math.max(0, used) : 0;
  const limit = Number(plan?.messages_limit ?? NaN);
  const hasLimit = Number.isFinite(limit) && limit >= 0;

  const creditsLimit = hasLimit ? limit : null;
  const creditsRemaining = hasLimit ? Math.max(0, limit - safeUsed) : null;
  const usedPercent = hasLimit && limit > 0 ? Math.min(100, Math.round((safeUsed / limit) * 100)) : null;
  const remainingPercent =
    hasLimit && limit > 0 ? Math.max(0, 100 - (usedPercent || 0)) : null;

  return {
    id: user?.plan_id || plan?.id || null,
    status: user?.plan_status || null,
    trial_ends_at: user?.trial_ends_at || null,
    price: plan?.price ?? null,
    bots_limit: plan?.bots_limit ?? null,
    files_limit: plan?.files_limit ?? null,
    messages_limit: plan?.messages_limit ?? null,
    avatar_allowed: plan?.avatar_allowed ?? null,
    branding_allowed: plan?.branding_allowed ?? null,
    embed_allowed: plan?.embed_allowed ?? null,
    credits_used: safeUsed,
    credits_limit: creditsLimit,
    credits_remaining: creditsRemaining,
    credits_percent_used: usedPercent,
    credits_percent_remaining: remainingPercent,
  };
};

const buildPublicUser = (session, user) => ({
  id: user.id,
  email: user.email,
  name: session?.name || deriveDisplayName(user.email),
  avatar_url: session?.picture || null,
  picture: session?.picture || null,
  plan_id: user.plan_id ?? null,
  plan_status: user.plan_status ?? null,
  messages_used: user.messages_used ?? 0,
  trial_ends_at: user.trial_ends_at ?? null,
  created_at: user.created_at ?? null,
});

const getAuthContext = async (request, env) => {
  const session = getSessionFromCookie(request);
  if (!session?.email) {
    return { session: null, user: null, plan: null, sessionChanged: false };
  }

  const user = await getOrCreateUser(env, session);
  if (!user) {
    return { session, user: null, plan: null, sessionChanged: false };
  }

  const nextSession = {
    ...session,
    id: user.id,
    email: user.email,
    name: session.name || deriveDisplayName(user.email),
  };
  const sessionChanged = session.id !== nextSession.id || session.name !== nextSession.name;

  const plan = await fetchPlanById(env, user.plan_id);
  return {
    session: nextSession,
    user,
    plan: buildPlanSummary(user, plan),
    sessionChanged,
  };
};

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const isEnabledFromStatus = (status) => {
  if (typeof status !== "string" || !status) return true;
  const normalized = status.trim().toLowerCase();
  return !["disabled", "inactive", "off", "archived"].includes(normalized);
};

const normalizeBot = (bot) => {
  const config = isObject(bot?.config) ? bot.config : {};
  const preset = bot?.prompt_mode || config.preset || "support";
  const enabled = isEnabledFromStatus(bot?.status);
  return {
    ...bot,
    preset,
    enabled,
  };
};

const normalizeFile = (file) => ({
  ...file,
  size: file?.size_bytes ?? null,
});

const normalizeConversation = (conversation) => ({
  ...conversation,
  last_message: conversation?.last_message_preview ?? null,
  visitor_name: conversation?.visitor_id ?? null,
});

const normalizeMessage = (message) => ({
  ...message,
  role: message?.role || message?.sender || "assistant",
});

const buildBotOwnershipOrClause = (user) => {
  const parts = [];
  if (user?.id) {
    parts.push(`user_id.eq.${user.id}`);
    parts.push(`owner_id.eq.${user.id}`);
    parts.push(`bubble_user_id.eq.${user.id}`);
  }
  if (user?.email) {
    parts.push(`bubble_user_id.eq.${user.email}`);
  }
  if (!parts.length) return null;
  return `(${parts.join(",")})`;
};

const listOwnedBots = async (env, user, options = {}) => {
  const ownerFilter = buildBotOwnershipOrClause(user);
  if (!ownerFilter) return [];

  const params = new URLSearchParams();
  params.set("select", options.select || "*");
  params.set("or", ownerFilter);
  if (options.id) {
    params.set("id", `eq.${options.id}`);
  }
  if (options.order) {
    params.set("order", options.order);
  }
  if (typeof options.limit === "number") {
    params.set("limit", String(options.limit));
  }

  const result = await supabaseRequest(env, `/rest/v1/bots?${params.toString()}`);
  if (!result.ok) {
    throw new Error(`Failed to load bots (${result.status})`);
  }
  return Array.isArray(result.data) ? result.data : [];
};

const getOwnedBot = async (env, user, botId, select) => {
  const rows = await listOwnedBots(env, user, {
    select: select || "*",
    id: botId,
    limit: 1,
  });
  return rows[0] || null;
};

const getOwnedBotIds = async (env, user) => {
  const bots = await listOwnedBots(env, user, {
    select: "id",
    order: "created_at.desc",
  });
  return bots.map((bot) => bot.id).filter(Boolean);
};

const getMessageCountForConversations = async (env, conversationIds, sinceIso = null) => {
  if (!Array.isArray(conversationIds) || !conversationIds.length) return 0;

  const params = new URLSearchParams();
  params.set("select", "id");
  params.set("conversation_id", `in.(${conversationIds.join(",")})`);
  if (sinceIso) {
    params.set("created_at", `gte.${sinceIso}`);
  }

  const result = await supabaseRequest(env, `/rest/v1/messages?${params.toString()}`, {
    headers: {
      Prefer: "count=exact",
      Range: "0-0",
    },
  });

  if (!result.ok) return 0;
  return parseCountFromContentRange(result.response) || 0;
};

const ensureConversationOwned = async (env, user, conversationId) => {
  const botIds = await getOwnedBotIds(env, user);
  if (!botIds.length) return null;

  const params = new URLSearchParams();
  params.set("select", "id,bot_id,visitor_id,last_message_preview,last_message_at");
  params.set("id", `eq.${conversationId}`);
  params.set("bot_id", `in.(${botIds.join(",")})`);
  params.set("limit", "1");

  const result = await supabaseRequest(env, `/rest/v1/conversations?${params.toString()}`);
  if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) return null;
  return result.data[0];
};

const readJsonBody = async (request) => {
  const text = await request.text();
  if (!text) return {};
  const parsed = parseJsonSafe(text, null);
  if (parsed === null) {
    throw new Error("Invalid JSON payload");
  }
  return parsed;
};

const buildSessionHeadersIfNeeded = (authContext, request) => {
  if (!authContext?.sessionChanged || !authContext?.session) return {};
  return { "Set-Cookie": buildSessionCookie(authContext.session, request.url) };
};

const handleAuthMe = async (request, env, cors) => {
  const auth = await getAuthContext(request, env);
  if (!auth.user) {
    return jsonResponse({ logged: false }, 401, cors);
  }

  const extraHeaders = buildSessionHeadersIfNeeded(auth, request);
  return jsonResponse(
    {
      logged: true,
      user: buildPublicUser(auth.session, auth.user),
      plan: auth.plan,
    },
    200,
    cors,
    extraHeaders
  );
};

const handleBotsGet = async (request, env, cors, auth) => {
  const bots = await listOwnedBots(env, auth.user, {
    select:
      "id,name,status,installed,created_at,updated_at,prompt_mode,config,system_prompt,model,temperature",
    order: "created_at.desc",
  });
  return jsonResponse(bots.map(normalizeBot), 200, cors, buildSessionHeadersIfNeeded(auth, request));
};

const handleBotsCreate = async (request, env, cors, auth) => {
  const body = await readJsonBody(request);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return jsonResponse({ error: "Bot name is required" }, 400, cors);
  }

  const limitResult = await supabaseRequest(env, "/rest/v1/rpc/check_bots_limit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ u_id: auth.user.id }),
  });
  if (limitResult.ok && limitResult.data === false) {
    return jsonResponse({ error: "Bots limit reached for your plan" }, 403, cors);
  }

  const preset =
    typeof body?.preset === "string" && body.preset.trim() ? body.preset.trim() : "support";
  const enabled = body?.enabled !== false;
  const now = new Date().toISOString();

  const config = isObject(body?.config) ? { ...body.config } : {};
  if (!Object.prototype.hasOwnProperty.call(config, "preset")) {
    config.preset = preset;
  }
  if (!Object.prototype.hasOwnProperty.call(config, "enabled")) {
    config.enabled = enabled;
  }

  const payload = {
    name,
    user_id: auth.user.id,
    owner_id: auth.user.id,
    bubble_user_id: auth.user.email,
    prompt_mode: preset,
    status: enabled ? "active" : "disabled",
    config,
    installed: Boolean(body?.installed),
    system_prompt: typeof body?.system_prompt === "string" ? body.system_prompt : null,
    model: typeof body?.model === "string" ? body.model : null,
    temperature: Number.isFinite(body?.temperature) ? body.temperature : null,
    created_at: now,
    updated_at: now,
  };

  const result = await supabaseRequest(env, "/rest/v1/bots", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  if (!result.ok) {
    return jsonResponse(
      { error: "Failed to create bot", details: result.data || null },
      result.status,
      cors
    );
  }

  const created = Array.isArray(result.data) ? result.data[0] : result.data;
  return jsonResponse(normalizeBot(created), 201, cors, buildSessionHeadersIfNeeded(auth, request));
};

const handleBotGet = async (request, env, cors, auth, botId) => {
  const bot = await getOwnedBot(
    env,
    auth.user,
    botId,
    "id,name,status,installed,created_at,updated_at,prompt_mode,config,system_prompt,model,temperature"
  );
  if (!bot) {
    return jsonResponse({ error: "Bot not found" }, 404, cors);
  }
  return jsonResponse(normalizeBot(bot), 200, cors, buildSessionHeadersIfNeeded(auth, request));
};

const handleBotUpdate = async (request, env, cors, auth, botId) => {
  const body = await readJsonBody(request);
  const existing = await getOwnedBot(env, auth.user, botId, "id,config");
  if (!existing) {
    return jsonResponse({ error: "Bot not found" }, 404, cors);
  }

  const updates = {};
  if (typeof body?.name === "string") {
    const trimmed = body.name.trim();
    if (!trimmed) return jsonResponse({ error: "Bot name cannot be empty" }, 400, cors);
    updates.name = trimmed;
  }
  if (typeof body?.system_prompt === "string") {
    updates.system_prompt = body.system_prompt;
  }
  if (typeof body?.model === "string") {
    updates.model = body.model;
  }
  if (Number.isFinite(body?.temperature)) {
    updates.temperature = body.temperature;
  }
  if (typeof body?.status === "string" && body.status.trim()) {
    updates.status = body.status.trim();
  }
  if (Object.prototype.hasOwnProperty.call(body || {}, "enabled")) {
    updates.status = body.enabled ? "active" : "disabled";
  }
  if (typeof body?.preset === "string" && body.preset.trim()) {
    updates.prompt_mode = body.preset.trim();
    if (!Object.prototype.hasOwnProperty.call(body, "config")) {
      const currentConfig = isObject(existing.config) ? { ...existing.config } : {};
      currentConfig.preset = updates.prompt_mode;
      updates.config = currentConfig;
    }
  }
  if (isObject(body?.config)) {
    updates.config = body.config;
  }
  if (isObject(body?.config_patch)) {
    const currentConfig = isObject(existing.config) ? { ...existing.config } : {};
    updates.config = { ...currentConfig, ...body.config_patch };
  }
  if (Object.prototype.hasOwnProperty.call(body || {}, "ready_config")) {
    const currentConfig = isObject(existing.config) ? { ...existing.config } : {};
    currentConfig.ready_config = body.ready_config;
    updates.config = currentConfig;
  }
  if (Object.prototype.hasOwnProperty.call(body || {}, "installed")) {
    updates.installed = Boolean(body.installed);
  }
  if (Object.prototype.hasOwnProperty.call(body || {}, "appearance")) {
    updates.appearance = body.appearance;
  }
  if (Object.prototype.hasOwnProperty.call(body || {}, "avatar")) {
    updates.avatar = body.avatar;
  }

  if (!Object.keys(updates).length) {
    return jsonResponse({ error: "No supported fields to update" }, 400, cors);
  }

  updates.updated_at = new Date().toISOString();

  const params = new URLSearchParams({ id: `eq.${botId}` });
  const result = await supabaseRequest(env, `/rest/v1/bots?${params.toString()}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(updates),
  });

  if (!result.ok) {
    return jsonResponse(
      { error: "Failed to update bot", details: result.data || null },
      result.status,
      cors
    );
  }

  const updated = Array.isArray(result.data) ? result.data[0] : result.data;
  return jsonResponse(normalizeBot(updated), 200, cors, buildSessionHeadersIfNeeded(auth, request));
};

const handleFilesCreate = async (request, env, cors, auth) => {
  const body = await readJsonBody(request);
  const botId = typeof body?.bot_id === "string" ? body.bot_id.trim() : "";
  if (!botId) {
    return jsonResponse({ error: "bot_id is required" }, 400, cors);
  }

  const bot = await getOwnedBot(env, auth.user, botId, "id");
  if (!bot) {
    return jsonResponse({ error: "Forbidden bot access" }, 403, cors);
  }

  const limitResult = await supabaseRequest(env, "/rest/v1/rpc/check_files_limit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ u_id: auth.user.id }),
  });
  if (limitResult.ok && limitResult.data === false) {
    return jsonResponse({ error: "Files limit reached for your plan" }, 403, cors);
  }

  const list = Array.isArray(body?.files) ? body.files : [body];
  const now = new Date().toISOString();

  const payload = list
    .map((item) => {
      const name = typeof item?.name === "string" ? item.name.trim() : "";
      if (!name) return null;

      const size = Number(item?.size_bytes);
      return {
        bot_id: botId,
        owner_id: auth.user.id,
        name,
        mime_type: typeof item?.mime_type === "string" && item.mime_type.trim() ? item.mime_type.trim() : null,
        size_bytes: Number.isFinite(size) && size >= 0 ? Math.round(size) : null,
        status: typeof item?.status === "string" && item.status.trim() ? item.status.trim() : "processing",
        url: typeof item?.url === "string" && item.url.trim() ? item.url.trim() : null,
        created_at: now,
      };
    })
    .filter(Boolean);

  if (!payload.length) {
    return jsonResponse({ error: "No valid files payload" }, 400, cors);
  }

  const insertResult = await supabaseRequest(env, "/rest/v1/bot_files", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  if (!insertResult.ok) {
    return jsonResponse(
      { error: "Failed to create files", details: insertResult.data || null },
      insertResult.status,
      cors
    );
  }

  const files = (Array.isArray(insertResult.data) ? insertResult.data : []).map(normalizeFile);
  return jsonResponse({ files }, 201, cors, buildSessionHeadersIfNeeded(auth, request));
};

const handleBotDelete = async (request, env, cors, auth, botId) => {
  const existing = await getOwnedBot(env, auth.user, botId, "id");
  if (!existing) {
    return jsonResponse({ error: "Bot not found" }, 404, cors);
  }

  const params = new URLSearchParams({ id: `eq.${botId}` });
  const result = await supabaseRequest(env, `/rest/v1/bots?${params.toString()}`, {
    method: "DELETE",
  });

  if (!result.ok) {
    return jsonResponse(
      { error: "Failed to delete bot", details: result.data || null },
      result.status,
      cors
    );
  }
  return jsonResponse({ ok: true }, 200, cors, buildSessionHeadersIfNeeded(auth, request));
};

const handleFilesGet = async (request, env, cors, auth, url) => {
  const botIds = await getOwnedBotIds(env, auth.user);
  if (!botIds.length) {
    return jsonResponse({ files: [], count: 0 }, 200, cors, buildSessionHeadersIfNeeded(auth, request));
  }

  const botId = url.searchParams.get("bot_id");
  if (botId && !botIds.includes(botId)) {
    return jsonResponse({ error: "Forbidden bot access" }, 403, cors);
  }

  const limit = clampInt(url.searchParams.get("limit"), 50, 1, 500);
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, 100000);
  const includeCount =
    (url.searchParams.get("include_count") || "").toLowerCase() === "1" ||
    (url.searchParams.get("include_count") || "").toLowerCase() === "true";

  const params = new URLSearchParams();
  params.set("select", "id,bot_id,name,mime_type,size_bytes,status,url,created_at");
  params.set("order", "created_at.desc");
  params.set("limit", String(limit));
  if (offset > 0) {
    params.set("offset", String(offset));
  }
  if (botId) {
    params.set("bot_id", `eq.${botId}`);
  } else {
    params.set("bot_id", `in.(${botIds.join(",")})`);
  }

  const rowsResult = await supabaseRequest(env, `/rest/v1/bot_files?${params.toString()}`);
  if (!rowsResult.ok) {
    return jsonResponse(
      { error: "Failed to fetch files", details: rowsResult.data || null },
      rowsResult.status,
      cors
    );
  }

  const files = (Array.isArray(rowsResult.data) ? rowsResult.data : []).map(normalizeFile);

  let totalCount = files.length;
  if (includeCount) {
    const countParams = new URLSearchParams();
    countParams.set("select", "id");
    if (botId) {
      countParams.set("bot_id", `eq.${botId}`);
    } else {
      countParams.set("bot_id", `in.(${botIds.join(",")})`);
    }

    const countResult = await supabaseRequest(env, `/rest/v1/bot_files?${countParams.toString()}`, {
      headers: {
        Prefer: "count=exact",
        Range: "0-0",
      },
    });

    if (countResult.ok) {
      totalCount = parseCountFromContentRange(countResult.response) ?? totalCount;
    }
  }

  return jsonResponse(
    { files, count: totalCount },
    200,
    cors,
    buildSessionHeadersIfNeeded(auth, request)
  );
};

const handleFileDelete = async (request, env, cors, auth, fileId) => {
  const botIds = await getOwnedBotIds(env, auth.user);
  if (!botIds.length) {
    return jsonResponse({ error: "File not found" }, 404, cors);
  }

  const findParams = new URLSearchParams({
    select: "id,bot_id",
    id: `eq.${fileId}`,
    limit: "1",
  });
  const fileResult = await supabaseRequest(env, `/rest/v1/bot_files?${findParams.toString()}`);
  const file = Array.isArray(fileResult.data) ? fileResult.data[0] : null;
  if (!file || !botIds.includes(file.bot_id)) {
    return jsonResponse({ error: "File not found" }, 404, cors);
  }

  const deleteParams = new URLSearchParams({ id: `eq.${fileId}` });
  const deleteResult = await supabaseRequest(env, `/rest/v1/bot_files?${deleteParams.toString()}`, {
    method: "DELETE",
  });
  if (!deleteResult.ok) {
    return jsonResponse(
      { error: "Failed to delete file", details: deleteResult.data || null },
      deleteResult.status,
      cors
    );
  }

  return jsonResponse({ ok: true }, 200, cors, buildSessionHeadersIfNeeded(auth, request));
};

const handleConversationsGet = async (request, env, cors, auth, url) => {
  const botIds = await getOwnedBotIds(env, auth.user);
  if (!botIds.length) {
    return jsonResponse(
      { conversations: [], messages_count: 0 },
      200,
      cors,
      buildSessionHeadersIfNeeded(auth, request)
    );
  }

  const botId = url.searchParams.get("bot_id");
  if (botId && !botIds.includes(botId)) {
    return jsonResponse({ error: "Forbidden bot access" }, 403, cors);
  }

  const days = clampInt(url.searchParams.get("days"), 0, 0, 365);
  const limit = clampInt(url.searchParams.get("limit"), 50, 1, 500);
  const includeMessageCount =
    (url.searchParams.get("include_message_count") || "1").toLowerCase() !== "0";

  const params = new URLSearchParams();
  params.set(
    "select",
    "id,bot_id,visitor_id,last_message_preview,last_message_at,messages_count,created_at,updated_at"
  );
  params.set("order", "last_message_at.desc.nullslast");
  params.set("limit", String(limit));
  if (botId) {
    params.set("bot_id", `eq.${botId}`);
  } else {
    params.set("bot_id", `in.(${botIds.join(",")})`);
  }

  let sinceIso = null;
  if (days > 0) {
    sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    params.set("created_at", `gte.${sinceIso}`);
  }

  const result = await supabaseRequest(env, `/rest/v1/conversations?${params.toString()}`);
  if (!result.ok) {
    return jsonResponse(
      { error: "Failed to fetch conversations", details: result.data || null },
      result.status,
      cors
    );
  }

  const conversations = (Array.isArray(result.data) ? result.data : []).map(normalizeConversation);
  const messagesCount = includeMessageCount
    ? await getMessageCountForConversations(
        env,
        conversations.map((conversation) => conversation.id).filter(Boolean),
        sinceIso
      )
    : null;

  return jsonResponse(
    {
      conversations,
      messages_count: messagesCount,
    },
    200,
    cors,
    buildSessionHeadersIfNeeded(auth, request)
  );
};

const handleMessagesGet = async (request, env, cors, auth, url) => {
  const conversationId = url.searchParams.get("conversation_id");
  if (!conversationId) {
    return jsonResponse({ error: "conversation_id is required" }, 400, cors);
  }

  const ownedConversation = await ensureConversationOwned(env, auth.user, conversationId);
  if (!ownedConversation) {
    return jsonResponse({ error: "Conversation not found" }, 404, cors);
  }

  const params = new URLSearchParams({
    select: "id,conversation_id,sender,role,content,metadata,created_at",
    conversation_id: `eq.${conversationId}`,
    order: "created_at.asc",
  });
  const result = await supabaseRequest(env, `/rest/v1/messages?${params.toString()}`);

  if (!result.ok) {
    return jsonResponse(
      { error: "Failed to fetch messages", details: result.data || null },
      result.status,
      cors
    );
  }

  return jsonResponse(
    {
      conversation: normalizeConversation(ownedConversation),
      messages: (Array.isArray(result.data) ? result.data : []).map(normalizeMessage),
    },
    200,
    cors,
    buildSessionHeadersIfNeeded(auth, request)
  );
};

const buildGoogleRedirectUri = (env) => env.GOOGLE_REDIRECT_URI || `${DEFAULT_API_ORIGIN}/auth/callback`;

const buildAuthSuccessRedirect = (env) =>
  env.AUTH_SUCCESS_REDIRECT || `${DEFAULT_APP_ORIGIN}/?auth_success=1`;

const handleGoogleStart = (request, env, cors) => {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: buildGoogleRedirectUri(env),
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state: crypto.randomUUID(),
  });

  return new Response(null, {
    status: 302,
    headers: {
      ...cors,
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    },
  });
};

const handleGoogleCallback = async (request, env, cors, url) => {
  const code = url.searchParams.get("code");
  if (!code) {
    return textResponse("Missing code", 400, cors);
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: buildGoogleRedirectUri(env),
      grant_type: "authorization_code",
    }),
  });

  const tokenData = parseJsonSafe(await tokenResponse.text(), {});
  if (!tokenResponse.ok || !tokenData?.access_token) {
    return jsonResponse({ error: "Google token exchange failed", details: tokenData }, 500, cors);
  }

  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });
  const profile = parseJsonSafe(await profileResponse.text(), {});
  if (!profileResponse.ok || !profile?.email) {
    return jsonResponse({ error: "Google profile fetch failed", details: profile }, 500, cors);
  }

  const user = await getOrCreateUser(env, {
    email: profile.email,
    id: null,
  });
  if (!user) {
    return jsonResponse({ error: "Failed to create user profile" }, 500, cors);
  }

  const session = {
    id: user.id,
    email: user.email,
    name: profile.name || deriveDisplayName(user.email),
    picture: profile.picture || null,
    created: Date.now(),
  };

  return new Response(null, {
    status: 302,
    headers: {
      ...cors,
      Location: buildAuthSuccessRedirect(env),
      "Set-Cookie": buildSessionCookie(session, request.url),
    },
  });
};

const handleLogout = (request, env, cors) =>
  new Response(null, {
    status: 302,
    headers: {
      ...cors,
      Location: env.LOGOUT_REDIRECT || DEFAULT_APP_ORIGIN,
      "Set-Cookie": buildExpiredSessionCookie(request.url),
    },
  });

const getAuthOrUnauthorized = async (request, env, cors) => {
  const auth = await getAuthContext(request, env);
  if (!auth.user) {
    return { auth: null, response: jsonResponse({ error: "Unauthorized" }, 401, cors) };
  }
  return { auth, response: null };
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = buildCorsHeaders(request);
    const { pathname } = url;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (pathname === "/health") {
        return textResponse("OK", 200, cors);
      }

      if (pathname === "/auth/google" || pathname === "/auth/google/start") {
        return handleGoogleStart(request, env, cors);
      }

      if (pathname === "/auth/callback" || pathname === "/auth/google/callback") {
        return handleGoogleCallback(request, env, cors, url);
      }

      if (pathname === "/auth/me" || pathname === "/api/me") {
        return handleAuthMe(request, env, cors);
      }

      if (pathname === "/auth/logout") {
        return handleLogout(request, env, cors);
      }

      if (pathname === "/auth/login" || pathname === "/auth/signup") {
        return jsonResponse(
          { error: "Email/password auth is not configured in this worker" },
          501,
          cors
        );
      }

      if (pathname === "/api/bots") {
        const { auth, response } = await getAuthOrUnauthorized(request, env, cors);
        if (response) return response;

        if (request.method === "GET") return handleBotsGet(request, env, cors, auth);
        if (request.method === "POST") return handleBotsCreate(request, env, cors, auth);
        return jsonResponse({ error: "Method not allowed" }, 405, cors);
      }

      if (pathname.startsWith("/api/bots/")) {
        const { auth, response } = await getAuthOrUnauthorized(request, env, cors);
        if (response) return response;

        const botId = decodeURIComponent(pathname.split("/")[3] || "");
        if (!botId) return jsonResponse({ error: "Missing bot id" }, 400, cors);

        if (request.method === "GET") return handleBotGet(request, env, cors, auth, botId);
        if (request.method === "PATCH") return handleBotUpdate(request, env, cors, auth, botId);
        if (request.method === "DELETE") return handleBotDelete(request, env, cors, auth, botId);
        return jsonResponse({ error: "Method not allowed" }, 405, cors);
      }

      if (pathname === "/api/files") {
        const { auth, response } = await getAuthOrUnauthorized(request, env, cors);
        if (response) return response;

        if (request.method === "GET") return handleFilesGet(request, env, cors, auth, url);
        if (request.method === "POST") return handleFilesCreate(request, env, cors, auth);
        return jsonResponse({ error: "Method not allowed" }, 405, cors);
      }

      if (pathname.startsWith("/api/files/")) {
        const { auth, response } = await getAuthOrUnauthorized(request, env, cors);
        if (response) return response;

        const fileId = decodeURIComponent(pathname.split("/")[3] || "");
        if (!fileId) return jsonResponse({ error: "Missing file id" }, 400, cors);

        if (request.method === "DELETE") return handleFileDelete(request, env, cors, auth, fileId);
        return jsonResponse({ error: "Method not allowed" }, 405, cors);
      }

      if (pathname === "/api/conversations") {
        const { auth, response } = await getAuthOrUnauthorized(request, env, cors);
        if (response) return response;

        if (request.method === "GET") return handleConversationsGet(request, env, cors, auth, url);
        return jsonResponse({ error: "Method not allowed" }, 405, cors);
      }

      if (pathname === "/api/messages") {
        const { auth, response } = await getAuthOrUnauthorized(request, env, cors);
        if (response) return response;

        if (request.method === "GET") return handleMessagesGet(request, env, cors, auth, url);
        return jsonResponse({ error: "Method not allowed" }, 405, cors);
      }

      return jsonResponse({ error: "Not found" }, 404, cors);
    } catch (error) {
      console.error("Worker error:", error);
      return jsonResponse({ error: "Internal server error" }, 500, cors);
    }
  },
};
