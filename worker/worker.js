const SESSION_COOKIE = "session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_APP_ORIGIN = "https://daveri.io";

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

const buildPublicV1CorsHeaders = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
});

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

const supabaseHeadersWithKey = (apiKey, extraHeaders = {}) => ({
  apikey: apiKey,
  Authorization: `Bearer ${apiKey}`,
  ...extraHeaders,
});

const supabaseRequestWithKey = async (env, apiKey, path, options = {}) => {
  const url = `${env.SUPABASE_URL}${path}`;
  const headers = supabaseHeadersWithKey(apiKey, options.headers || {});
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

const supabaseRestAsUser = async (env, accessToken, path, options = {}) => {
  const anonKey = typeof env?.SUPABASE_ANON_KEY === "string" ? env.SUPABASE_ANON_KEY.trim() : "";
  if (!anonKey) {
    return {
      ok: false,
      status: 502,
      data: { error: "Missing SUPABASE_ANON_KEY in worker env" },
      response: null,
    };
  }
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    return {
      ok: false,
      status: 401,
      data: { error: "Missing access token" },
      response: null,
    };
  }

  const url = `${env.SUPABASE_URL}${path}`;
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    ...(options.headers || {}),
  };
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

const getSupabasePublicKey = (env) => env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

const getServiceRoleKeyIssue = (env) => {
  const serviceKey = typeof env?.SUPABASE_SERVICE_ROLE_KEY === "string" ? env.SUPABASE_SERVICE_ROLE_KEY.trim() : "";
  const anonKey = typeof env?.SUPABASE_ANON_KEY === "string" ? env.SUPABASE_ANON_KEY.trim() : "";

  if (!serviceKey) {
    return "SUPABASE_SERVICE_ROLE_KEY is missing";
  }
  if (serviceKey === anonKey && anonKey) {
    return "SUPABASE_SERVICE_ROLE_KEY matches SUPABASE_ANON_KEY";
  }
  if (serviceKey.startsWith("sb_publishable_")) {
    return "SUPABASE_SERVICE_ROLE_KEY is a publishable key";
  }
  return null;
};

const supabaseRequest = async (env, path, options = {}) =>
  supabaseRequestWithKey(env, env.SUPABASE_SERVICE_ROLE_KEY, path, options);

const supabasePublicRequest = async (env, path, options = {}) => {
  const anonKey = env.SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = anonKey || serviceKey;
  if (!apiKey) {
    throw new Error("Missing SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY in worker env");
  }

  const firstAttempt = await supabaseRequestWithKey(env, apiKey, path, options);
  if (
    anonKey &&
    serviceKey &&
    anonKey !== serviceKey &&
    !firstAttempt.ok &&
    (firstAttempt.status === 401 || firstAttempt.status === 403)
  ) {
    return supabaseRequestWithKey(env, serviceKey, path, options);
  }
  return firstAttempt;
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
const PLAN_SELECT = "id,name,price_monthly,is_active,is_custom,sort_order";

const toNumberOrNull = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const getDefaultPlanId = async (env) => {
  if (cachedDefaultPlanId !== undefined) return cachedDefaultPlanId;

  const freeParams = new URLSearchParams({
    select: "id",
    id: "eq.free",
    is_active: "eq.true",
    limit: "1",
  });
  const freeResult = await supabaseRequest(env, `/rest/v1/plans?${freeParams.toString()}`);
  if (freeResult.ok && Array.isArray(freeResult.data) && freeResult.data[0]?.id) {
    cachedDefaultPlanId = freeResult.data[0].id;
    return cachedDefaultPlanId;
  }

  const activeParams = new URLSearchParams({
    select: "id",
    is_active: "eq.true",
    order: "sort_order.asc,id.asc",
    limit: "1",
  });
  const activeResult = await supabaseRequest(env, `/rest/v1/plans?${activeParams.toString()}`);
  if (activeResult.ok && Array.isArray(activeResult.data) && activeResult.data[0]?.id) {
    cachedDefaultPlanId = activeResult.data[0].id;
    return cachedDefaultPlanId;
  }

  const anyParams = new URLSearchParams({
    select: "id",
    order: "sort_order.asc,id.asc",
    limit: "1",
  });
  const anyResult = await supabaseRequest(env, `/rest/v1/plans?${anyParams.toString()}`);
  if (anyResult.ok && Array.isArray(anyResult.data) && anyResult.data[0]?.id) {
    cachedDefaultPlanId = anyResult.data[0].id;
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

const createUserRecord = async (env, email, diagnostics = null) => {
  const serviceKeyIssue = getServiceRoleKeyIssue(env);
  if (serviceKeyIssue) {
    if (diagnostics) {
      diagnostics.create_user_error = {
        code: "service_role_key_invalid",
        message: serviceKeyIssue,
      };
    }
    return null;
  }

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

  if (!result.ok) {
    if (diagnostics) {
      diagnostics.create_user_error = {
        code: "users_insert_failed",
        status: result.status,
        details: result.data || null,
      };
    }
    return null;
  }
  if (!Array.isArray(result.data) || result.data.length === 0) {
    if (diagnostics) {
      diagnostics.create_user_error = {
        code: "users_insert_empty_response",
        status: result.status,
        details: result.data || null,
      };
    }
    return null;
  }
  return result.data[0];
};

const getOrCreateUser = async (env, session, diagnostics = null) => {
  if (!session?.email) return null;

  let user = null;
  if (session.id) {
    user = await fetchUserById(env, session.id);
  }
  if (!user) {
    user = await fetchUserByEmail(env, session.email);
  }
  if (user) return user;

  user = await createUserRecord(env, session.email, diagnostics);
  if (user) return user;

  return await fetchUserByEmail(env, session.email);
};

const fetchPlanById = async (env, planId) => {
  if (!planId) return null;
  const params = new URLSearchParams({
    select: PLAN_SELECT,
    id: `eq.${planId}`,
    limit: "1",
  });
  const result = await supabaseRequest(env, `/rest/v1/plans?${params.toString()}`);
  if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) return null;
  return result.data[0];
};

const buildPlanSummary = (user, plan) => ({
  id: user?.plan_id || plan?.id || null,
  status: user?.plan_status || null,
  trial_ends_at: user?.trial_ends_at || null,
  name: typeof plan?.name === "string" ? plan.name : null,
  price_monthly: toNumberOrNull(plan?.price_monthly),
  price: toNumberOrNull(plan?.price_monthly),
  is_active: typeof plan?.is_active === "boolean" ? plan.is_active : null,
  is_custom: typeof plan?.is_custom === "boolean" ? plan.is_custom : null,
  sort_order: toNumberOrNull(plan?.sort_order),
});

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

const listOwnedBots = async (env, user, accessToken, options = {}) => {
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

  const result = await supabaseRestAsUser(env, accessToken, `/rest/v1/bots?${params.toString()}`);
  if (!result.ok) {
    throw new Error(`Failed to load bots (${result.status})`);
  }
  return Array.isArray(result.data) ? result.data : [];
};

const getOwnedBot = async (env, user, accessToken, botId, select) => {
  const rows = await listOwnedBots(env, user, accessToken, {
    select: select || "*",
    id: botId,
    limit: 1,
  });
  return rows[0] || null;
};

const getOwnedBotIds = async (env, user, accessToken) => {
  const bots = await listOwnedBots(env, user, accessToken, {
    select: "id",
    order: "created_at.desc",
  });
  return bots.map((bot) => bot.id).filter(Boolean);
};

const BOT_LIMIT_FEATURE_KEYS = ["bots_limit", "bots", "max_bots", "bots_quota"];
const FILE_LIMIT_FEATURE_KEYS = ["files_limit", "files", "max_files", "files_quota"];

const readQuotaPolicy = (entitlementRows, featureKeys) => {
  for (const key of featureKeys) {
    const row = findEntitlementRow(entitlementRows, key);
    if (!row) continue;
    const limitNumeric = Number(row.limit_value);
    return {
      configured: true,
      enabled: row.enabled === true,
      limit: Number.isFinite(limitNumeric) ? Math.max(0, Math.floor(limitNumeric)) : null,
    };
  }
  return {
    configured: false,
    enabled: true,
    limit: null,
  };
};

const sanitizeFeatureKeys = (featureKeys) =>
  Array.isArray(featureKeys)
    ? featureKeys
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
        .map((value) => value.replace(/[(),]/g, ""))
    : [];

const fetchEffectiveEntitlementRowsAsUser = async (env, userId, accessToken, featureKeys = null) => {
  if (!userId) return [];

  const params = new URLSearchParams({
    select: "plan_id,feature_key,enabled,limit_value,meta",
    user_id: `eq.${userId}`,
  });
  const values = sanitizeFeatureKeys(featureKeys);
  if (values.length) {
    params.set("feature_key", `in.(${values.join(",")})`);
  }

  const result = await supabaseRestAsUser(
    env,
    accessToken,
    `/rest/v1/v_effective_entitlements?${params.toString()}`
  );
  if (!result.ok || !Array.isArray(result.data)) return [];
  return result.data;
};

const canCreateBotForUser = async (env, user, accessToken) => {
  if (!user?.id) return false;
  const entitlementRows = await fetchEffectiveEntitlementRowsAsUser(
    env,
    user.id,
    accessToken,
    BOT_LIMIT_FEATURE_KEYS
  );
  const policy = readQuotaPolicy(entitlementRows, BOT_LIMIT_FEATURE_KEYS);
  if (policy.configured && policy.enabled !== true) return false;
  if (policy.limit === null) return true;

  const bots = await listOwnedBots(env, user, accessToken, {
    select: "id",
  });
  return bots.length < policy.limit;
};

const canUploadFilesForUser = async (env, user, accessToken) => {
  if (!user?.id) return false;
  const entitlementRows = await fetchEffectiveEntitlementRowsAsUser(
    env,
    user.id,
    accessToken,
    FILE_LIMIT_FEATURE_KEYS
  );
  const policy = readQuotaPolicy(entitlementRows, FILE_LIMIT_FEATURE_KEYS);
  if (policy.configured && policy.enabled !== true) return false;
  if (policy.limit === null) return true;

  const botIds = await getOwnedBotIds(env, user, accessToken);
  if (!botIds.length) return true;

  const countParams = new URLSearchParams({
    select: "id",
    bot_id: `in.(${botIds.join(",")})`,
  });
  const countResult = await supabaseRestAsUser(env, accessToken, `/rest/v1/bot_files?${countParams.toString()}`, {
    headers: {
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  if (!countResult.ok) return true;

  const currentCount = parseCountFromContentRange(countResult.response);
  if (currentCount === null) return true;
  return currentCount < policy.limit;
};

const getMessageCountForConversations = async (env, accessToken, conversationIds, sinceIso = null) => {
  if (!Array.isArray(conversationIds) || !conversationIds.length) return 0;

  const params = new URLSearchParams();
  params.set("select", "id");
  params.set("conversation_id", `in.(${conversationIds.join(",")})`);
  if (sinceIso) {
    params.set("created_at", `gte.${sinceIso}`);
  }

  const result = await supabaseRestAsUser(env, accessToken, `/rest/v1/messages?${params.toString()}`, {
    headers: {
      Prefer: "count=exact",
      Range: "0-0",
    },
  });

  if (!result.ok) return 0;
  return parseCountFromContentRange(result.response) || 0;
};

const ensureConversationOwned = async (env, user, accessToken, conversationId) => {
  const botIds = await getOwnedBotIds(env, user, accessToken);
  if (!botIds.length) return null;

  const params = new URLSearchParams();
  params.set("select", "id,bot_id,visitor_id,last_message_preview,last_message_at");
  params.set("id", `eq.${conversationId}`);
  params.set("bot_id", `in.(${botIds.join(",")})`);
  params.set("limit", "1");

  const result = await supabaseRestAsUser(env, accessToken, `/rest/v1/conversations?${params.toString()}`);
  if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) return null;
  return result.data[0];
};

const requireRequestContext = (ctx) => {
  if (!ctx || typeof ctx !== "object") {
    throw Object.assign(new Error("request_context_required"), {
      code: "request_context_required",
    });
  }
  return ctx;
};

const getBodyTextOnce = async (req, ctx) => {
  const context = requireRequestContext(ctx);
  if (context.__bodyText !== undefined) return context.__bodyText;

  let text = "";
  try {
    text = await req.clone().text();
    if (!text && !req.bodyUsed) {
      text = await req.text();
    }
  } catch (e) {
    if (!req.bodyUsed) {
      try {
        text = await req.text();
      } catch {}
    }
  }

  context.__bodyText = text || "";
  return context.__bodyText;
};

const getBodyJsonOnce = async (req, ctx) => {
  const context = requireRequestContext(ctx);
  if (context.__bodyJson !== undefined) return context.__bodyJson;

  const raw = await getBodyTextOnce(req, context);
  if (!raw || !raw.trim()) {
    context.__bodyJson = null;
    return null;
  }

  try {
    context.__bodyJson = JSON.parse(raw);
    return context.__bodyJson;
  } catch (e) {
    throw Object.assign(new Error("invalid_json"), {
      code: "invalid_json",
      rawLen: raw.length,
      rawHead: raw.slice(0, 120),
    });
  }
};

const readJsonBody = async (request, ctx) => {
  const parsed = await getBodyJsonOnce(request, ctx);
  if (parsed === null) return {};
  return parsed;
};

const isProductionRuntime = (env) => {
  const mode = String(env?.NODE_ENV || env?.ENVIRONMENT || env?.APP_ENV || env?.WORKER_ENV || "").toLowerCase();
  if (!mode) return true;
  if (mode === "production" || mode === "prod") return true;
  if (mode === "development" || mode === "dev" || mode === "test" || mode === "local") return false;
  if (mode === "preview" || mode === "staging") return false;
  return true;
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
  const bots = await listOwnedBots(env, auth.user, auth.accessToken, {
    select:
      "id,name,status,installed,created_at,updated_at,prompt_mode,config,system_prompt,model,temperature",
    order: "created_at.desc",
  });
  return jsonResponse(bots.map(normalizeBot), 200, cors);
};

const handleBotsCreate = async (request, env, cors, auth, ctx) => {
  const body = await readJsonBody(request, ctx);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return jsonResponse({ error: "Bot name is required" }, 400, cors);
  }

  const canCreateBot = await canCreateBotForUser(env, auth.user, auth.accessToken);
  if (!canCreateBot) {
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

  const result = await supabaseRestAsUser(env, auth.accessToken, "/rest/v1/bots", {
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
  return jsonResponse(normalizeBot(created), 201, cors);
};

const handleBotGet = async (request, env, cors, auth, botId) => {
  const bot = await getOwnedBot(
    env,
    auth.user,
    auth.accessToken,
    botId,
    "id,name,status,installed,created_at,updated_at,prompt_mode,config,system_prompt,model,temperature"
  );
  if (!bot) {
    return jsonResponse({ error: "Bot not found" }, 404, cors);
  }
  return jsonResponse(normalizeBot(bot), 200, cors);
};

const handleBotUpdate = async (request, env, cors, auth, botId, ctx) => {
  const body = await readJsonBody(request, ctx);
  const existing = await getOwnedBot(env, auth.user, auth.accessToken, botId, "id,config");
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
  const result = await supabaseRestAsUser(env, auth.accessToken, `/rest/v1/bots?${params.toString()}`, {
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
  return jsonResponse(normalizeBot(updated), 200, cors);
};

const handleFilesCreate = async (request, env, cors, auth, ctx) => {
  const body = await readJsonBody(request, ctx);
  const botId = typeof body?.bot_id === "string" ? body.bot_id.trim() : "";
  if (!botId) {
    return jsonResponse({ error: "bot_id is required" }, 400, cors);
  }

  const bot = await getOwnedBot(env, auth.user, auth.accessToken, botId, "id");
  if (!bot) {
    return jsonResponse({ error: "Forbidden bot access" }, 403, cors);
  }

  const canUploadFiles = await canUploadFilesForUser(env, auth.user, auth.accessToken);
  if (!canUploadFiles) {
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

  const insertResult = await supabaseRestAsUser(env, auth.accessToken, "/rest/v1/bot_files", {
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
  return jsonResponse({ files }, 201, cors);
};

const handleBotDelete = async (request, env, cors, auth, botId) => {
  const existing = await getOwnedBot(env, auth.user, auth.accessToken, botId, "id");
  if (!existing) {
    return jsonResponse({ error: "Bot not found" }, 404, cors);
  }

  const params = new URLSearchParams({ id: `eq.${botId}` });
  const result = await supabaseRestAsUser(env, auth.accessToken, `/rest/v1/bots?${params.toString()}`, {
    method: "DELETE",
  });

  if (!result.ok) {
    return jsonResponse(
      { error: "Failed to delete bot", details: result.data || null },
      result.status,
      cors
    );
  }
  return jsonResponse({ ok: true }, 200, cors);
};

const handleFilesGet = async (request, env, cors, auth, url) => {
  const botIds = await getOwnedBotIds(env, auth.user, auth.accessToken);
  if (!botIds.length) {
    return jsonResponse({ files: [], count: 0 }, 200, cors);
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

  const rowsResult = await supabaseRestAsUser(
    env,
    auth.accessToken,
    `/rest/v1/bot_files?${params.toString()}`
  );
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

    const countResult = await supabaseRestAsUser(
      env,
      auth.accessToken,
      `/rest/v1/bot_files?${countParams.toString()}`,
      {
        headers: {
          Prefer: "count=exact",
          Range: "0-0",
        },
      }
    );

    if (countResult.ok) {
      totalCount = parseCountFromContentRange(countResult.response) ?? totalCount;
    }
  }

  return jsonResponse({ files, count: totalCount }, 200, cors);
};

const handleFileDelete = async (request, env, cors, auth, fileId) => {
  const botIds = await getOwnedBotIds(env, auth.user, auth.accessToken);
  if (!botIds.length) {
    return jsonResponse({ error: "File not found" }, 404, cors);
  }

  const findParams = new URLSearchParams({
    select: "id,bot_id",
    id: `eq.${fileId}`,
    limit: "1",
  });
  const fileResult = await supabaseRestAsUser(
    env,
    auth.accessToken,
    `/rest/v1/bot_files?${findParams.toString()}`
  );
  const file = Array.isArray(fileResult.data) ? fileResult.data[0] : null;
  if (!file || !botIds.includes(file.bot_id)) {
    return jsonResponse({ error: "File not found" }, 404, cors);
  }

  const deleteParams = new URLSearchParams({ id: `eq.${fileId}` });
  const deleteResult = await supabaseRestAsUser(
    env,
    auth.accessToken,
    `/rest/v1/bot_files?${deleteParams.toString()}`,
    {
      method: "DELETE",
    }
  );
  if (!deleteResult.ok) {
    return jsonResponse(
      { error: "Failed to delete file", details: deleteResult.data || null },
      deleteResult.status,
      cors
    );
  }

  return jsonResponse({ ok: true }, 200, cors);
};

const handleConversationsGet = async (request, env, cors, auth, url) => {
  const botIds = await getOwnedBotIds(env, auth.user, auth.accessToken);
  if (!botIds.length) {
    return jsonResponse({ conversations: [], messages_count: 0 }, 200, cors);
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

  const result = await supabaseRestAsUser(
    env,
    auth.accessToken,
    `/rest/v1/conversations?${params.toString()}`
  );
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
        auth.accessToken,
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
    cors
  );
};

const handleMessagesGet = async (request, env, cors, auth, url) => {
  const conversationId = url.searchParams.get("conversation_id");
  if (!conversationId) {
    return jsonResponse({ error: "conversation_id is required" }, 400, cors);
  }

  const ownedConversation = await ensureConversationOwned(
    env,
    auth.user,
    auth.accessToken,
    conversationId
  );
  if (!ownedConversation) {
    return jsonResponse({ error: "Conversation not found" }, 404, cors);
  }

  const params = new URLSearchParams({
    select: "id,conversation_id,sender,role,content,metadata,created_at",
    conversation_id: `eq.${conversationId}`,
    order: "created_at.asc",
  });
  const result = await supabaseRestAsUser(env, auth.accessToken, `/rest/v1/messages?${params.toString()}`);

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
    cors
  );
};

const BILLING_FEATURE_MONTHLY_CREDITS = "monthly_credits";
const BILLING_FEATURE_DAILY_CREDITS_CAP = "daily_credits_cap";
const CREDIT_STATE_SELECT =
  "user_id,monthly_balance,daily_balance,next_daily_reset,next_monthly_reset,updated_at";
const normalizePlanIdValue = (value) =>
  typeof value === "string" && value.trim() ? value.trim().toLowerCase() : "";

const toIntOrNull = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.floor(numeric));
};

const toDateOrNull = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const nextUtcDayIso = (value = new Date()) => {
  const source = value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date();
  const next = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate() + 1));
  return next.toISOString();
};

const addMonthIso = (value = new Date()) => {
  const source = value instanceof Date && !Number.isNaN(value.getTime()) ? new Date(value.getTime()) : new Date();
  source.setUTCMonth(source.getUTCMonth() + 1);
  return source.toISOString();
};

const fetchUserPlanId = async (env, userId) => {
  if (!userId) return null;
  const params = new URLSearchParams({
    select: "plan_id",
    id: `eq.${userId}`,
    limit: "1",
  });
  const result = await supabaseRequest(env, `/rest/v1/users?${params.toString()}`);
  if (!result.ok || !Array.isArray(result.data) || !result.data[0]) return null;
  const value = result.data[0]?.plan_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const fetchEffectivePlanId = async (env, userId, fallbackPlanId = null, options = {}) => {
  if (!userId) return fallbackPlanId;
  const preferredPlanId =
    typeof options?.preferredPlanId === "string" && options.preferredPlanId.trim()
      ? options.preferredPlanId.trim()
      : null;
  const normalizedPreferredPlanId = normalizePlanIdValue(preferredPlanId);

  const params = new URLSearchParams({
    select: "plan_id",
    user_id: `eq.${userId}`,
    limit: "1",
  });
  const result = await supabaseRequest(env, `/rest/v1/v_effective_plan?${params.toString()}`);
  const effectivePlanId =
    result.ok && Array.isArray(result.data) && result.data[0]?.plan_id ? result.data[0].plan_id : null;
  const normalizedEffectivePlanId = normalizePlanIdValue(effectivePlanId);

  if (normalizedPreferredPlanId && normalizedPreferredPlanId !== normalizedEffectivePlanId) {
    const preferredPlan = await fetchPlanById(env, preferredPlanId);
    if (preferredPlan?.id) return preferredPlan.id;
  }

  if (effectivePlanId) return effectivePlanId;

  const userPlanId = await fetchUserPlanId(env, userId);
  const normalizedUserPlanId = normalizePlanIdValue(userPlanId);
  if (normalizedPreferredPlanId && normalizedPreferredPlanId !== normalizedUserPlanId) {
    const preferredPlan = await fetchPlanById(env, preferredPlanId);
    if (preferredPlan?.id) return preferredPlan.id;
  }

  return userPlanId || fallbackPlanId;
};

const sanitizeInValues = (values) =>
  values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .map((value) => value.replace(/[(),]/g, ""));

const fetchPlanEntitlementRows = async (env, planId, featureKeys = null) => {
  const normalizedPlanId = typeof planId === "string" && planId.trim() ? planId.trim() : null;
  if (!normalizedPlanId) return [];
  const params = new URLSearchParams({
    select: "plan_id,feature_key,enabled,limit_value,meta",
    plan_id: `eq.${normalizedPlanId}`,
  });
  if (Array.isArray(featureKeys) && featureKeys.length) {
    const values = sanitizeInValues(featureKeys);
    if (values.length) {
      params.set("feature_key", `in.(${values.join(",")})`);
    }
  }
  const result = await supabaseRequest(env, `/rest/v1/plan_entitlements?${params.toString()}`);
  if (!result.ok || !Array.isArray(result.data)) return [];
  return result.data.map((row) => ({
    ...row,
    plan_id: normalizedPlanId,
  }));
};

const fetchEffectiveEntitlementRows = async (env, userId, featureKeys = null, options = {}) => {
  if (!userId) return [];
  const preferredPlanId =
    typeof options?.preferredPlanId === "string" && options.preferredPlanId.trim()
      ? options.preferredPlanId.trim()
      : null;
  if (preferredPlanId) {
    const preferredRows = await fetchPlanEntitlementRows(env, preferredPlanId, featureKeys);
    if (preferredRows.length) return preferredRows;
  }

  const params = new URLSearchParams({
    select: "plan_id,feature_key,enabled,limit_value,meta",
    user_id: `eq.${userId}`,
  });
  if (Array.isArray(featureKeys) && featureKeys.length) {
    const values = sanitizeInValues(featureKeys);
    if (values.length) {
      params.set("feature_key", `in.(${values.join(",")})`);
    }
  }

  const result = await supabaseRequest(env, `/rest/v1/v_effective_entitlements?${params.toString()}`);
  if (result.ok && Array.isArray(result.data)) return result.data;

  const effectivePlanId = await fetchEffectivePlanId(env, userId, null, {
    preferredPlanId,
  });
  if (!effectivePlanId) return [];

  return fetchPlanEntitlementRows(env, effectivePlanId, featureKeys);
};

const findEntitlementRow = (rows, featureKey) =>
  Array.isArray(rows)
    ? rows.find(
        (row) =>
          typeof row?.feature_key === "string" &&
          row.feature_key.trim().toLowerCase() === String(featureKey || "").trim().toLowerCase()
      ) || null
    : null;

const entitlementLimit = (rows, featureKey) => {
  const row = findEntitlementRow(rows, featureKey);
  if (!row) return null;
  return toIntOrNull(row.limit_value);
};

const entitlementLimitByMatcher = (rows, matcher) => {
  if (!Array.isArray(rows) || typeof matcher !== "function") return null;
  for (const row of rows) {
    const key = typeof row?.feature_key === "string" ? row.feature_key.trim().toLowerCase() : "";
    if (!key || !matcher(key, row)) continue;
    const limit = toIntOrNull(row.limit_value);
    if (limit !== null) return limit;
  }
  return null;
};

const resolveCreditLimits = (entitlementRows) => {
  let monthlyLimit = entitlementLimit(entitlementRows, BILLING_FEATURE_MONTHLY_CREDITS);
  let dailyCap = entitlementLimit(entitlementRows, BILLING_FEATURE_DAILY_CREDITS_CAP);

  if (monthlyLimit === null) {
    monthlyLimit = entitlementLimitByMatcher(
      entitlementRows,
      (key) => key.includes("month") && key.includes("credit")
    );
  }
  if (dailyCap === null) {
    dailyCap = entitlementLimitByMatcher(
      entitlementRows,
      (key) =>
        key.includes("day") &&
        (key.includes("credit") || key.includes("cap") || key.includes("quota"))
    );
  }
  if (monthlyLimit === null) {
    monthlyLimit = entitlementLimitByMatcher(
      entitlementRows,
      (key) => key === "credits" || key === "credits_limit" || key === "message_credits"
    );
  }

  return { monthlyLimit, dailyCap };
};

const fetchCreditStateRow = async (env, userId) => {
  if (!userId) return null;
  const params = new URLSearchParams({
    select: CREDIT_STATE_SELECT,
    user_id: `eq.${userId}`,
    limit: "1",
  });
  const result = await supabaseRequest(env, `/rest/v1/user_credit_state?${params.toString()}`);
  if (!result.ok || !Array.isArray(result.data) || !result.data[0]) return null;
  return result.data[0];
};

const patchCreditStateRow = async (env, userId, patch) => {
  const params = new URLSearchParams({
    select: CREDIT_STATE_SELECT,
    user_id: `eq.${userId}`,
  });
  const result = await supabaseRequest(env, `/rest/v1/user_credit_state?${params.toString()}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(patch || {}),
  });
  if (!result.ok || !Array.isArray(result.data) || !result.data[0]) {
    throw new Error(`credit_state_patch_failed:${result.status}`);
  }
  return result.data[0];
};

const ensureCreditStateRow = async (env, userId, monthlyLimit, dailyCap) => {
  let state = await fetchCreditStateRow(env, userId);
  if (state) return state;

  const now = new Date();
  const payload = {
    user_id: userId,
    monthly_balance: monthlyLimit ?? 0,
    daily_balance: dailyCap ?? 0,
    next_monthly_reset: addMonthIso(now),
    next_daily_reset: nextUtcDayIso(now),
    updated_at: now.toISOString(),
  };

  const insertParams = new URLSearchParams({
    on_conflict: "user_id",
  });
  const insertResult = await supabaseRequest(env, `/rest/v1/user_credit_state?${insertParams.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(payload),
  });

  if (!insertResult.ok) {
    let initFailedStatus = null;
    const initResult = await supabaseRequest(env, "/rest/v1/rpc/init_user_credits", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_user_id: userId,
      }),
    });
    if (!initResult.ok) {
      initFailedStatus = initResult.status || null;
      if (
        insertResult.status !== 401 &&
        insertResult.status !== 403 &&
        initFailedStatus !== 401 &&
        initFailedStatus !== 403
      ) {
        throw new Error(
          `credit_state_init_failed:insert=${insertResult.status},rpc=${initFailedStatus}`
        );
      }
    }
  }

  state = await fetchCreditStateRow(env, userId);
  if (state) return state;

  const repairPatch = {
    monthly_balance: monthlyLimit ?? 0,
    daily_balance: dailyCap ?? 0,
    next_monthly_reset: addMonthIso(now),
    next_daily_reset: nextUtcDayIso(now),
    updated_at: now.toISOString(),
  };

  const retryInsertResult = await supabaseRequest(env, `/rest/v1/user_credit_state?${insertParams.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify({
      user_id: userId,
      ...repairPatch,
    }),
  });
  if (!retryInsertResult.ok) {
    if (retryInsertResult.status === 401 || retryInsertResult.status === 403) {
      return {
        user_id: userId,
        monthly_balance: monthlyLimit ?? 0,
        daily_balance: dailyCap ?? 0,
        next_daily_reset: nextUtcDayIso(now),
        next_monthly_reset: addMonthIso(now),
        updated_at: now.toISOString(),
        synthetic: true,
      };
    }
    throw new Error(`credit_state_missing:retry_insert=${retryInsertResult.status}`);
  }

  state = await fetchCreditStateRow(env, userId);
  if (state) return state;
  return {
    user_id: userId,
    monthly_balance: monthlyLimit ?? 0,
    daily_balance: dailyCap ?? 0,
    next_daily_reset: nextUtcDayIso(now),
    next_monthly_reset: addMonthIso(now),
    updated_at: now.toISOString(),
  };
};

const maybeResetCreditState = async (env, userId, state, monthlyLimit, dailyCap) => {
  if (!state) return state;
  const now = new Date();
  const updates = {};

  const nextDailyReset = toDateOrNull(state.next_daily_reset);
  if (dailyCap !== null && (!nextDailyReset || nextDailyReset <= now)) {
    updates.daily_balance = dailyCap;
    updates.next_daily_reset = nextUtcDayIso(now);
  }

  const nextMonthlyReset = toDateOrNull(state.next_monthly_reset);
  if (monthlyLimit !== null && (!nextMonthlyReset || nextMonthlyReset <= now)) {
    updates.monthly_balance = monthlyLimit;
    updates.next_monthly_reset = addMonthIso(nextMonthlyReset && nextMonthlyReset <= now ? nextMonthlyReset : now);
  }

  if (!Object.keys(updates).length) return state;
  updates.updated_at = now.toISOString();
  return patchCreditStateRow(env, userId, updates);
};

const buildCreditStatusPayload = (planId, monthlyLimit, dailyCap, state) => {
  const monthlyBalance = toIntOrNull(state?.monthly_balance) ?? 0;
  const dailyBalance = toIntOrNull(state?.daily_balance) ?? 0;
  const remaining = monthlyBalance + dailyBalance;
  const capacity =
    monthlyLimit === null || dailyCap === null
      ? null
      : Math.max(0, Math.floor(Number(monthlyLimit) + Number(dailyCap)));

  return {
    plan_id: planId || null,
    monthly_limit: monthlyLimit,
    monthly_balance: monthlyBalance,
    daily_cap: dailyCap,
    daily_balance: dailyBalance,
    remaining,
    capacity,
    next_daily_reset:
      typeof state?.next_daily_reset === "string" && state.next_daily_reset.trim()
        ? state.next_daily_reset
        : null,
    next_monthly_reset:
      typeof state?.next_monthly_reset === "string" && state.next_monthly_reset.trim()
        ? state.next_monthly_reset
        : null,
  };
};

const buildCreditFallbackStatus = (planId = null) => ({
  plan_id: planId || null,
  monthly_limit: 0,
  monthly_balance: 0,
  daily_cap: 0,
  daily_balance: 0,
  remaining: 0,
  capacity: 0,
  next_daily_reset: null,
  next_monthly_reset: null,
});

const getCreditStatusRecord = async (env, userId, options = {}) => {
  const fallbackPlanId =
    typeof options?.fallbackPlanId === "string" && options.fallbackPlanId.trim()
      ? options.fallbackPlanId.trim()
      : null;
  const preferredPlanId =
    typeof options?.preferredPlanId === "string" && options.preferredPlanId.trim()
      ? options.preferredPlanId.trim()
      : fallbackPlanId;
  const shouldApplyResets = options?.applyResets === true;

  let planId = await fetchEffectivePlanId(env, userId, fallbackPlanId, {
    preferredPlanId,
  });
  if (
    preferredPlanId &&
    normalizePlanIdValue(preferredPlanId) &&
    normalizePlanIdValue(preferredPlanId) !== normalizePlanIdValue(planId)
  ) {
    planId = preferredPlanId;
  }

  const entitlementRows = await fetchEffectiveEntitlementRows(env, userId, [
    BILLING_FEATURE_MONTHLY_CREDITS,
    BILLING_FEATURE_DAILY_CREDITS_CAP,
  ], {
    preferredPlanId: planId || preferredPlanId || null,
  });
  let { monthlyLimit, dailyCap } = resolveCreditLimits(entitlementRows);
  const normalizedPlanId = typeof planId === "string" ? planId.trim().toLowerCase() : "";
  if (monthlyLimit === null && normalizedPlanId && normalizedPlanId !== "individual") {
    monthlyLimit = 0;
  }
  if (dailyCap === null && monthlyLimit !== null) {
    dailyCap = 0;
  }

  let state = await ensureCreditStateRow(env, userId, monthlyLimit, dailyCap);
  if (shouldApplyResets) {
    state = await maybeResetCreditState(env, userId, state, monthlyLimit, dailyCap);
  }

  return buildCreditStatusPayload(planId, monthlyLimit, dailyCap, state);
};

const consumeCreditBalance = async (env, userId, amount, options = {}) => {
  const safeAmount = Math.max(1, Math.floor(Number(amount) || 1));
  const status = await getCreditStatusRecord(env, userId, {
    fallbackPlanId: options?.fallbackPlanId || null,
    preferredPlanId: options?.preferredPlanId || options?.fallbackPlanId || null,
    applyResets: true,
  });

  if (status.monthly_limit === null) {
    return {
      allowed: true,
      status,
    };
  }

  const remaining = toIntOrNull(status.remaining) ?? 0;
  if (remaining < safeAmount) {
    return {
      allowed: false,
      status,
    };
  }

  const currentDaily = toIntOrNull(status.daily_balance) ?? 0;
  const currentMonthly = toIntOrNull(status.monthly_balance) ?? 0;
  const consumeDaily = Math.min(currentDaily, safeAmount);
  const consumeMonthly = safeAmount - consumeDaily;

  const nextDaily = Math.max(0, currentDaily - consumeDaily);
  const nextMonthly = Math.max(0, currentMonthly - consumeMonthly);
  const nextRemaining = nextDaily + nextMonthly;

  try {
    await patchCreditStateRow(env, userId, {
      daily_balance: nextDaily,
      monthly_balance: nextMonthly,
      updated_at: new Date().toISOString(),
    });

    const refreshed = await getCreditStatusRecord(env, userId, {
      fallbackPlanId: status.plan_id,
      preferredPlanId: status.plan_id,
      applyResets: false,
    });

    return {
      allowed: true,
      status: refreshed,
    };
  } catch {
    return {
      allowed: true,
      status: {
        ...status,
        daily_balance: nextDaily,
        monthly_balance: nextMonthly,
        remaining: nextRemaining,
      },
      degraded: true,
    };
  }
};

const applyPlanChangeRecord = async (env, userId, newPlanId, mode = "upgrade") => {
  const normalizedPlanId = typeof newPlanId === "string" && newPlanId.trim() ? newPlanId.trim() : null;
  if (!normalizedPlanId) {
    return { ok: false, error: "invalid_plan_id", status: 400 };
  }

  const targetPlan = await fetchPlanById(env, normalizedPlanId);
  if (!targetPlan) {
    return { ok: false, error: "plan_not_found", status: 404 };
  }

  const updateParams = new URLSearchParams({
    id: `eq.${userId}`,
  });
  const updateResult = await supabaseRequest(env, `/rest/v1/users?${updateParams.toString()}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      plan_id: normalizedPlanId,
    }),
  });

  if (!updateResult.ok) {
    return {
      ok: false,
      error: "plan_update_failed",
      status: updateResult.status || 502,
      details: updateResult.data || null,
    };
  }

  const normalizedMode = typeof mode === "string" && mode.trim() ? mode.trim().toLowerCase() : "upgrade";
  if (normalizedMode === "upgrade") {
    const upgradedStatus = await getCreditStatusRecord(env, userId, {
      fallbackPlanId: normalizedPlanId,
      preferredPlanId: normalizedPlanId,
      applyResets: false,
    });

    const monthlyLimit = toIntOrNull(upgradedStatus.monthly_limit);
    const dailyCap = toIntOrNull(upgradedStatus.daily_cap);
    const now = new Date();
    const patch = {
      next_monthly_reset: addMonthIso(now),
      next_daily_reset: nextUtcDayIso(now),
      updated_at: now.toISOString(),
    };
    if (monthlyLimit !== null) patch.monthly_balance = monthlyLimit;
    if (dailyCap !== null) patch.daily_balance = dailyCap;
    await patchCreditStateRow(env, userId, patch);
  }

  const status = await getCreditStatusRecord(env, userId, {
    fallbackPlanId: normalizedPlanId,
    preferredPlanId: normalizedPlanId,
    applyResets: false,
  });
  return {
    ok: true,
    status,
    result: {
      plan_id: normalizedPlanId,
      mode: normalizedMode,
    },
  };
};

const getEntitlementsMapRecord = async (env, userId, options = {}) => {
  const preferredPlanId =
    typeof options?.preferredPlanId === "string" && options.preferredPlanId.trim()
      ? options.preferredPlanId.trim()
      : null;
  const rows = await fetchEffectiveEntitlementRows(env, userId, null, {
    preferredPlanId,
  });
  const map = {};
  rows.forEach((row) => {
    const featureKey = typeof row?.feature_key === "string" ? row.feature_key.trim() : "";
    if (!featureKey) return;
    const limit = toIntOrNull(row.limit_value);
    const meta = isObject(row?.meta) ? row.meta : {};
    const requiredPlan =
      typeof meta?.required_plan === "string" && meta.required_plan.trim()
        ? meta.required_plan.trim()
        : typeof row?.plan_id === "string" && row.plan_id.trim()
          ? row.plan_id.trim()
          : null;

    map[featureKey] = {
      enabled: row?.enabled === true,
      limit,
      limit_value: limit,
      required_plan: requiredPlan,
      meta,
    };
  });
  return map;
};

const handleCreditsStatus = async (request, env, cors, auth) => {
  try {
    const status = await getCreditStatusRecord(env, auth.user.id, {
      fallbackPlanId: auth.user?.plan_id || null,
      preferredPlanId: auth.user?.plan_id || null,
      applyResets: false,
    });
    return jsonResponse(
      { status: status || null },
      200,
      cors
    );
  } catch (error) {
    return jsonResponse(
      {
        status: buildCreditFallbackStatus(auth.user?.plan_id || null),
        degraded: true,
        error: "credits_status_fallback",
        details: error?.message || null,
      },
      200,
      cors
    );
  }
};

const handleCreditsConsume = async (request, env, cors, auth, ctx) => {
  let body = {};
  try {
    body = await readJsonBody(request, ctx);
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400, cors);
  }

  const amount = Math.max(1, Math.floor(Number(body?.amount || 1)));
  try {
    const result = await consumeCreditBalance(env, auth.user.id, amount, {
      fallbackPlanId: auth.user?.plan_id || null,
      preferredPlanId: auth.user?.plan_id || null,
    });
    const status = isObject(result?.status) ? result.status : null;
    return jsonResponse(
      {
        ...(status || {}),
        allowed: result?.allowed === true,
        status,
      },
      200,
      cors
    );
  } catch (error) {
    return jsonResponse(
      {
        allowed: false,
        status: buildCreditFallbackStatus(auth.user?.plan_id || null),
        degraded: true,
        error: "credits_consume_fallback",
        details: error?.message || null,
      },
      200,
      cors
    );
  }
};

const handleCreditsUpgrade = async (request, env, cors, auth, ctx) => {
  let body = {};
  try {
    body = await readJsonBody(request, ctx);
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400, cors);
  }

  const newPlanId =
    typeof body?.new_plan_id === "string" && body.new_plan_id.trim() ? body.new_plan_id.trim() : "premium";
  const changeTypeCandidate =
    typeof body?.change_type === "string" && body.change_type.trim()
      ? body.change_type.trim()
      : typeof body?.mode === "string" && body.mode.trim()
        ? body.mode.trim()
        : "upgrade";

  try {
    const updateResult = await applyPlanChangeRecord(env, auth.user.id, newPlanId, changeTypeCandidate);
    if (!updateResult.ok) {
      return jsonResponse(
        {
          error: "plan_upgrade_failed",
          details: updateResult.details || updateResult.error || null,
        },
        updateResult.status || 502,
        cors
      );
    }

    return jsonResponse(
      {
        ok: true,
        result: updateResult.result || null,
        status: updateResult.status || null,
      },
      200,
      cors
    );
  } catch (error) {
    return jsonResponse(
      { error: "plan_upgrade_failed", details: error?.message || null },
      502,
      cors
    );
  }
};

const normalizeEntitlementsMap = (payload) => {
  if (isObject(payload?.entitlements_map)) return payload.entitlements_map;
  if (isObject(payload?.entitlements)) return payload.entitlements;
  if (isObject(payload?.map)) return payload.map;
  if (isObject(payload)) return payload;

  if (typeof payload === "string") {
    const parsed = parseJsonSafe(payload, null);
    if (isObject(parsed?.entitlements_map)) return parsed.entitlements_map;
    if (isObject(parsed?.entitlements)) return parsed.entitlements;
    if (isObject(parsed?.map)) return parsed.map;
    if (isObject(parsed)) return parsed;
  }

  return {};
};

const handleEntitlementsMap = async (request, env, cors, auth) => {
  try {
    const map = await getEntitlementsMapRecord(env, auth.user.id, {
      preferredPlanId: auth.user?.plan_id || null,
    });
    return jsonResponse(
      {
        entitlements_map: normalizeEntitlementsMap(map),
      },
      200,
      cors
    );
  } catch (error) {
    return jsonResponse(
      {
        entitlements_map: {},
        degraded: true,
        error: "entitlements_fallback",
        details: error?.message || null,
      },
      200,
      cors
    );
  }
};

const parseMaybeJsonString = (value) => {
  if (typeof value !== "string") return { value, raw: null, parsed: false };
  const parsed = parseJsonSafe(value, null);
  if (parsed === null) {
    return { value, raw: value, parsed: false };
  }
  return { value: parsed, raw: null, parsed: true };
};

const pickAskAnswer = (payload) => {
  if (typeof payload === "string") return payload;
  if (!isObject(payload)) return "";

  const candidates = [
    payload.assistant_message,
    payload.answer,
    payload.output,
    payload.reply,
    payload.message,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string") return candidate;
    if (candidate !== null && candidate !== undefined && typeof candidate !== "object") {
      return String(candidate);
    }
  }

  if (Array.isArray(payload.responses) && payload.responses.length) {
    const first = payload.responses[0];
    if (typeof first === "string") return first;
    if (isObject(first) && typeof first.text === "string") return first.text;
  }

  return "";
};

const pickConversationId = (payload) => {
  if (!isObject(payload)) return null;
  const candidate =
    payload.conversation_id ?? payload.conversationId ?? payload.session_id ?? payload.sessionId ?? null;
  if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  return null;
};

const readBearerToken = (request) => {
  const headerValue = request.headers.get("Authorization") || request.headers.get("authorization") || "";
  if (typeof headerValue !== "string") return null;
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1]?.trim();
  return token || null;
};

const isLikelyJwt = (token) => {
  if (typeof token !== "string") return false;
  const trimmed = token.trim();
  if (!trimmed) return false;
  const parts = trimmed.split(".");
  return parts.length === 3 && parts[0].startsWith("eyJ");
};

const parseResponseDetails = (rawText, parsed, fallbackStatus) => {
  if (typeof parsed === "string") return parsed;
  if (isObject(parsed) || Array.isArray(parsed)) return JSON.stringify(parsed);
  if (typeof rawText === "string" && rawText.trim()) return rawText;
  return `HTTP ${fallbackStatus}`;
};

const supabaseRpcAsUserWithKey = async (env, apiKey, accessToken, rpcName, args = {}) => {
  const url = `${env.SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(rpcName)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(args || {}),
  });

  const rawText = await response.text();
  const parsed = rawText ? parseJsonSafe(rawText, rawText) : null;
  return {
    ok: response.ok,
    status: response.status,
    data: parsed,
    details: parseResponseDetails(rawText, parsed, response.status || 500),
  };
};

const supabaseRpcAsUser = async (env, accessToken, rpcName, args = {}) => {
  const anonKey = env.SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const firstKey = anonKey || serviceKey;
  if (!firstKey) {
    return { ok: false, status: 502, data: null, details: "Missing SUPABASE key in worker env" };
  }

  const firstAttempt = await supabaseRpcAsUserWithKey(env, firstKey, accessToken, rpcName, args);
  if (
    anonKey &&
    serviceKey &&
    anonKey !== serviceKey &&
    !firstAttempt.ok &&
    (firstAttempt.status === 401 || firstAttempt.status === 403)
  ) {
    return supabaseRpcAsUserWithKey(env, serviceKey, accessToken, rpcName, args);
  }
  return firstAttempt;
};

const getSupabaseAuthUserFromToken = async (env, accessToken) => {
  const anonKey = env.SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = anonKey || serviceKey;
  if (!apiKey) {
    return { user: null, error: "Missing SUPABASE key in worker env", status: 502 };
  }

  const requestUser = async (key) =>
    fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${accessToken}`,
      },
    });

  let response = await requestUser(apiKey);
  if (
    anonKey &&
    serviceKey &&
    anonKey !== serviceKey &&
    !response.ok &&
    (response.status === 401 || response.status === 403)
  ) {
    response = await requestUser(serviceKey);
  }

  const rawText = await response.text();
  const parsed = parseJsonSafe(rawText, null);
  if (!response.ok) {
    const details =
      typeof parsed === "string"
        ? parsed
        : isObject(parsed) || Array.isArray(parsed)
          ? JSON.stringify(parsed)
          : rawText || `HTTP ${response.status}`;
    return { user: null, error: details, status: response.status || 401 };
  }

  if (!isObject(parsed) || typeof parsed.id !== "string" || !parsed.id.trim()) {
    return { user: null, error: "Invalid Supabase auth user payload", status: 401 };
  }

  return { user: parsed, error: null, status: 200 };
};

const normalizeRpcRecord = (payload) => {
  if (Array.isArray(payload)) return payload[0] || null;
  if (payload === null || payload === undefined) return null;
  return payload;
};

const extractInternalUserId = (payload) => {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (!payload || typeof payload !== "object") return null;

  const candidates = [
    payload.daveri_internal_user_id,
    payload.internal_user_id,
    payload.user_id,
    payload.id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
};

const ensureAgentUserContext = async (env, accessToken) => {
  const ensureResult = await supabaseRpcAsUser(env, accessToken, "daveri_ensure_user_row", {});
  if (!ensureResult.ok) {
    return {
      ok: false,
      status: ensureResult.status || 502,
      error: `daveri_ensure_user_row failed: ${ensureResult.details}`,
    };
  }

  const internalResult = await supabaseRpcAsUser(env, accessToken, "daveri_internal_user_id", {});
  if (!internalResult.ok) {
    return {
      ok: false,
      status: internalResult.status || 502,
      error: `daveri_internal_user_id failed: ${internalResult.details}`,
    };
  }

  const internalUserId = extractInternalUserId(normalizeRpcRecord(internalResult.data) || internalResult.data);
  if (!internalUserId) {
    return {
      ok: false,
      status: 500,
      error: "Unable to resolve internal_user_id from daveri_internal_user_id()",
    };
  }

  const ensuredRecord = normalizeRpcRecord(ensureResult.data);
  return {
    ok: true,
    internal_user_id: internalUserId,
    ensured_user: ensuredRecord,
  };
};

const normalizeAgentUsage = (payload) => {
  const row = normalizeRpcRecord(payload);
  if (!isObject(row)) return null;

  const dailyUsed = toIntOrNull(row.daily_used);
  const dailyCap = toIntOrNull(row.daily_cap);
  const monthlyUsed = toIntOrNull(row.monthly_used);
  const monthlyCap = toIntOrNull(row.monthly_cap);

  if (dailyUsed === null || dailyCap === null || monthlyUsed === null || monthlyCap === null) {
    return null;
  }

  return {
    daily_used: dailyUsed,
    daily_cap: dailyCap,
    monthly_used: monthlyUsed,
    monthly_cap: monthlyCap,
  };
};

const getAgentUsageAsUser = async (env, accessToken) => {
  const usageResult = await supabaseRpcAsUser(env, accessToken, "daveri_agent_credit_status", {});
  if (!usageResult.ok) return null;
  return normalizeAgentUsage(usageResult.data);
};

const askBotViaEdge = async (env, payload) => {
  const anonKey = env.SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = anonKey || serviceKey;
  if (!apiKey) {
    return { ok: false, status: 502, details: "Missing SUPABASE key in worker env", parsed: null, rawText: "" };
  }

  const askRequest = async (key) =>
    fetch(`${env.SUPABASE_URL}/functions/v1/ask-bot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    });

  let response = await askRequest(apiKey);
  if (
    anonKey &&
    serviceKey &&
    anonKey !== serviceKey &&
    !response.ok &&
    (response.status === 401 || response.status === 403)
  ) {
    response = await askRequest(serviceKey);
  }

  const rawText = await response.text();
  const parsed = parseJsonSafe(rawText, null);
  if (!response.ok) {
    return {
      ok: false,
      status: 502,
      details: parseResponseDetails(rawText, parsed, response.status || 502),
      parsed,
      rawText,
    };
  }

  return { ok: true, status: 200, details: null, parsed, rawText };
};

const handleV1BotConfig = async (env, cors, botId) => {
  const safeBotId = typeof botId === "string" ? botId.trim() : "";
  if (!safeBotId) {
    return jsonResponse({ error: "missing_bot_id" }, 400, cors);
  }

  const params = new URLSearchParams({
    select: "id,config,name,status,model",
    id: `eq.${safeBotId}`,
    limit: "1",
  });
  const result = await supabasePublicRequest(env, `/rest/v1/bots_public_config?${params.toString()}`);
  if (!result.ok) {
    return jsonResponse(
      { error: "config_fetch_failed", details: result.data || null },
      result.status || 502,
      cors
    );
  }

  const bot = Array.isArray(result.data) ? result.data[0] : null;
  if (!bot) {
    return jsonResponse({ error: "bot_not_found" }, 404, cors);
  }

  const parsedConfig = parseMaybeJsonString(bot.config ?? null);
  const payload = {
    bot_id: String(bot.id || safeBotId),
    config: parsedConfig.value ?? null,
    name: typeof bot.name === "string" ? bot.name : null,
    status: typeof bot.status === "string" ? bot.status : null,
    model: typeof bot.model === "string" ? bot.model : null,
  };

  if (parsedConfig.raw !== null) {
    payload.config_raw = parsedConfig.raw;
  }

  return jsonResponse(payload, 200, cors);
};

const handleV1Ask = async (request, env, cors, ctx) => {
  const bearerToken = readBearerToken(request);
  if (isLikelyJwt(bearerToken)) {
    return jsonResponse(
      {
        error: "agent_endpoint_required",
        details: "AGENT UI must call /v1/agent/ask. Endpoint /v1/ask is widget-only.",
      },
      400,
      cors
    );
  }

  let body;
  try {
    body = await readJsonBody(request, ctx);
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400, cors);
  }

  const botId = typeof body?.bot_id === "string" ? body.bot_id.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!botId || !message) {
    return jsonResponse({ error: "invalid_payload", details: "bot_id and message are required" }, 400, cors);
  }

  const visitorId =
    typeof body?.visitor_id === "string" && body.visitor_id.trim() ? body.visitor_id.trim() : "guest";
  const conversationId =
    typeof body?.conversation_id === "string" && body.conversation_id.trim()
      ? body.conversation_id.trim()
      : null;
  const history = Array.isArray(body?.history) ? body.history : [];

  const forwardPayload = {
    bot_id: botId,
    visitor_id: visitorId,
    conversation_id: conversationId,
    message,
    history,
  };

  const askResult = await askBotViaEdge(env, forwardPayload);
  if (!askResult.ok) {
    return jsonResponse({ error: "ask_failed", details: askResult.details }, askResult.status || 502, cors);
  }

  const answer = pickAskAnswer(askResult.parsed || askResult.rawText);
  const nextConversationId = pickConversationId(askResult.parsed);

  return jsonResponse(
    {
      answer: typeof answer === "string" ? answer : String(answer || ""),
      assistant_message: typeof answer === "string" ? answer : String(answer || ""),
      conversation_id: nextConversationId,
    },
    200,
    cors
  );
};

/*
Manual test (JWT):
curl -i -X POST "https://api.daveri.io/v1/agent/ask" \
  -H "Authorization: Bearer <SUPABASE_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"bot_id\":\"<BOT_ID>\",\"message\":\"Hello from agent\"}"

Expected: HTTP 200 + { assistant_message, conversation_id, usage? }

Manual test (without JWT):
curl -i -X POST "https://api.daveri.io/v1/agent/ask" \
  -H "Content-Type: application/json" \
  -d "{\"bot_id\":\"<BOT_ID>\",\"message\":\"Hello\"}"

Expected: HTTP 401 auth_required
*/
const handleV1AgentAsk = async (request, env, cors, ctx) => {
  const accessToken = readBearerToken(request);
  if (!isLikelyJwt(accessToken)) {
    return jsonResponse({ error: "auth_required", details: "Missing Bearer token" }, 401, cors);
  }

  const authResult = await getSupabaseAuthUserFromToken(env, accessToken);
  if (!authResult.user) {
    return jsonResponse(
      { error: "auth_required", details: authResult.error || "Unauthorized" },
      authResult.status || 401,
      cors
    );
  }

  const authUid = String(authResult.user.id || "").trim();
  const authEmail = typeof authResult.user.email === "string" ? authResult.user.email.trim() : "";
  if (!authUid) {
    return jsonResponse({ error: "auth_required", details: "Invalid auth user id" }, 401, cors);
  }

  const userContext = await ensureAgentUserContext(env, accessToken);
  if (!userContext.ok) {
    return jsonResponse(
      { error: "user_mapping_failed", details: userContext.error },
      userContext.status || 500,
      cors
    );
  }

  const usage = await getAgentUsageAsUser(env, accessToken);
  if (!usage) {
    return jsonResponse({ error: "usage_unavailable" }, 502, cors);
  }

  const isBlocked = usage.daily_used >= usage.daily_cap || usage.monthly_used >= usage.monthly_cap;
  if (isBlocked) {
    return jsonResponse({ error: "quota_exceeded", usage }, 402, cors);
  }

  console.log(
    "[ask] bodyUsed:",
    request.bodyUsed,
    "cl:",
    request.headers.get("content-length"),
    "ct:",
    request.headers.get("content-type")
  );

  let body;
  try {
    body = await readJsonBody(request, ctx);
  } catch (error) {
    if (error?.code !== "invalid_json") throw error;
    if (isProductionRuntime(env)) {
      return jsonResponse({ error: "invalid_json" }, 400, cors);
    }
    return jsonResponse(
      {
        error: "invalid_json",
        hint: "body must be valid JSON",
        rawLen: Number.isFinite(error.rawLen) ? error.rawLen : (ctx.__bodyText || "").length,
        rawHead: typeof error.rawHead === "string" ? error.rawHead : (ctx.__bodyText || "").slice(0, 120),
      },
      400,
      cors
    );
  }

  console.log(
    "[ask] rawLen:",
    (ctx?.__bodyText || "").length,
    "rawHead:",
    (ctx?.__bodyText || "").slice(0, 80)
  );

  const bot_id =
    body?.bot_id ||
    body?.active_bot_id ||
    (Array.isArray(body?.selected_bot_ids) ? body.selected_bot_ids[0] : null);

  const question = (body?.question ?? body?.message ?? "").toString().trim();
  const bodyKeys = Object.keys(body || {});
  console.log("[ask] keys", bodyKeys);
  console.log("[ask] bot_id", bot_id, "qLen", question.length);

  if (!bot_id || !question) {
    return jsonResponse({ error: "invalid_payload", details: "Missing bot_id or question" }, 400, cors);
  }

  const message = question;

  const conversationId =
    typeof body?.conversation_id === "string" && body.conversation_id.trim()
      ? body.conversation_id.trim()
      : null;
  const history = Array.isArray(body?.history) ? body.history : [];
  const activeBotId = typeof body?.active_bot_id === "string" && body.active_bot_id.trim() ? body.active_bot_id.trim() : null;
  const selectedBotIds = Array.isArray(body?.selected_bot_ids)
    ? body.selected_bot_ids
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];

  const forwardPayload = {
    bot_id,
    visitor_id: authUid,
    conversation_id: conversationId,
    message,
    history,
    active_bot_id: activeBotId,
    selected_bot_ids: selectedBotIds,
    agent_auth_uid: authUid,
    agent_email: authEmail || null,
    agent_internal_user_id: userContext.internal_user_id,
  };

  const askResult = await askBotViaEdge(env, forwardPayload);
  if (!askResult.ok) {
    return jsonResponse({ error: "ask_failed", details: askResult.details }, askResult.status || 502, cors);
  }

  const answer = pickAskAnswer(askResult.parsed || askResult.rawText);
  const nextConversationId = pickConversationId(askResult.parsed);
  const assistantMessage = typeof answer === "string" ? answer : String(answer || "");

  return jsonResponse(
    {
      assistant_message: assistantMessage,
      answer: assistantMessage,
      conversation_id: nextConversationId,
      usage: usage || null,
    },
    200,
    cors
  );
};

const SUPABASE_GOOGLE_CALLBACK_URL = "https://inayqymryrriobowyysw.supabase.co/auth/v1/callback";

const buildAuthLoginRedirect = (env) => env.AUTH_LOGIN_REDIRECT || `${DEFAULT_APP_ORIGIN}/login/`;

const buildGoogleLoginLocation = (request, env) => {
  const sourceUrl = new URL(request.url);
  const loginUrl = new URL(buildAuthLoginRedirect(env), sourceUrl.origin);

  loginUrl.searchParams.set("oauth", "google");
  const next = sourceUrl.searchParams.get("next") || sourceUrl.searchParams.get("redirect_to");
  if (typeof next === "string" && next.trim()) {
    loginUrl.searchParams.set("next", next.trim());
  }

  return loginUrl.toString();
};

const handleGoogleStart = (request, env, cors) =>
  new Response(null, {
    status: 302,
    headers: {
      ...cors,
      Location: buildGoogleLoginLocation(request, env),
      "X-DaVeri-Auth-Callback": SUPABASE_GOOGLE_CALLBACK_URL,
    },
  });

const handleGoogleCallback = (request, env, cors) =>
  new Response(null, {
    status: 302,
    headers: {
      ...cors,
      Location: buildGoogleLoginLocation(request, env),
      "X-DaVeri-Auth-Callback": SUPABASE_GOOGLE_CALLBACK_URL,
    },
  });

const handleLogout = (request, env, cors) =>
  new Response(null, {
    status: 302,
    headers: {
      ...cors,
      Location: env.LOGOUT_REDIRECT || DEFAULT_APP_ORIGIN,
      "Set-Cookie": buildExpiredSessionCookie(request.url),
    },
  });

const getAuthOrUnauthorizedJwt = async (request, env, cors) => {
  const accessToken = readBearerToken(request);
  if (!accessToken || !isLikelyJwt(accessToken)) {
    return { auth: null, response: jsonResponse({ error: "Unauthorized" }, 401, cors) };
  }

  const authResult = await getSupabaseAuthUserFromToken(env, accessToken);
  if (!authResult?.user) {
    return { auth: null, response: jsonResponse({ error: "Unauthorized" }, 401, cors) };
  }

  const userContext = await ensureAgentUserContext(env, accessToken);
  if (!userContext.ok) {
    return {
      auth: null,
      response: jsonResponse(
        { error: "user_mapping_failed", details: userContext.error || null },
        500,
        cors
      ),
    };
  }

  const internalUserId =
    typeof userContext.internal_user_id === "string" ? userContext.internal_user_id.trim() : "";
  if (!internalUserId) {
    return {
      auth: null,
      response: jsonResponse(
        { error: "user_mapping_failed", details: "Missing internal_user_id" },
        500,
        cors
      ),
    };
  }

  const authUser = authResult.user;
  const email = typeof authUser?.email === "string" ? authUser.email.trim() : "";
  let user = await fetchUserById(env, internalUserId);
  if (!user && email) {
    user = await getOrCreateUser(env, {
      id: internalUserId,
      email,
      name: deriveDisplayName(email),
    });
  }

  if (!user) {
    return { auth: null, response: jsonResponse({ error: "Unauthorized" }, 401, cors) };
  }

  if (!user.email && email) {
    user = {
      ...user,
      email,
    };
  }

  const auth = {
    accessToken,
    authUser,
    internal_user_id: internalUserId,
    email: email || user.email || "",
    user,
  };

  return { auth, response: null };
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = buildCorsHeaders(request);
    const publicV1Cors = buildPublicV1CorsHeaders();
    const requestContext = {};
    const { pathname } = url;

    if (request.method === "OPTIONS" && pathname.startsWith("/v1/")) {
      return new Response(null, { status: 204, headers: publicV1Cors });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (pathname.startsWith("/v1/")) {
        if (pathname === "/v1/agent/ping") {
          if (request.method === "GET") {
            return jsonResponse({ ok: true }, 200, publicV1Cors);
          }
          return jsonResponse({ error: "method_not_allowed" }, 405, publicV1Cors);
        }
        if (pathname === "/v1/ask") {
          if (request.method === "POST") {
            return handleV1Ask(request, env, publicV1Cors, requestContext);
          }
          return jsonResponse({ error: "method_not_allowed" }, 405, publicV1Cors);
        }
        if (pathname === "/v1/agent/ask") {
          if (request.method === "POST") {
            return handleV1AgentAsk(request, env, publicV1Cors, requestContext);
          }
          return jsonResponse({ error: "method_not_allowed" }, 405, publicV1Cors);
        }

        const parts = pathname.split("/").filter(Boolean);
        if (parts.length === 4 && parts[0] === "v1" && parts[1] === "bots" && parts[3] === "config") {
          if (request.method === "GET") {
            const botId = decodeURIComponent(parts[2] || "");
            return handleV1BotConfig(env, publicV1Cors, botId);
          }
          return jsonResponse({ error: "method_not_allowed" }, 405, publicV1Cors);
        }

        return jsonResponse({ error: "not_found" }, 404, publicV1Cors);
      }

      if (pathname === "/health") {
        return textResponse("OK", 200, cors);
      }

      if (pathname === "/auth/google" || pathname === "/auth/google/start") {
        return handleGoogleStart(request, env, cors);
      }

      if (pathname === "/auth/callback" || pathname === "/auth/google/callback") {
        return handleGoogleCallback(request, env, cors);
      }

      if (pathname === "/auth/me") {
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

      if (pathname === "/api/credits/status") {
        const { auth, response } = await getAuthOrUnauthorizedJwt(request, env, cors);
        if (response) return response;

        if (request.method === "GET") return handleCreditsStatus(request, env, cors, auth);
        return jsonResponse({ error: "Method not allowed" }, 405, cors);
      }

      if (pathname === "/api/credits/consume") {
        const { auth, response } = await getAuthOrUnauthorizedJwt(request, env, cors);
        if (response) return response;

        if (request.method === "POST") return handleCreditsConsume(request, env, cors, auth, requestContext);
        return jsonResponse({ error: "Method not allowed" }, 405, cors);
      }

      if (pathname === "/api/credits/upgrade") {
        const { auth, response } = await getAuthOrUnauthorizedJwt(request, env, cors);
        if (response) return response;

        if (request.method === "POST") return handleCreditsUpgrade(request, env, cors, auth, requestContext);
        return jsonResponse({ error: "Method not allowed" }, 405, cors);
      }

      if (pathname === "/api/entitlements") {
        const { auth, response } = await getAuthOrUnauthorizedJwt(request, env, cors);
        if (response) return response;

        if (request.method === "GET") return handleEntitlementsMap(request, env, cors, auth);
        return jsonResponse({ error: "Method not allowed" }, 405, cors);
      }

      if (pathname === "/api/bots") {
        const { auth, response } = await getAuthOrUnauthorizedJwt(request, env, cors);
        if (response) return response;

        if (request.method === "GET") return handleBotsGet(request, env, cors, auth);
        if (request.method === "POST") return handleBotsCreate(request, env, cors, auth, requestContext);
        return jsonResponse({ error: "Method not allowed" }, 405, cors);
      }

      if (pathname.startsWith("/api/bots/")) {
        const { auth, response } = await getAuthOrUnauthorizedJwt(request, env, cors);
        if (response) return response;

        const botId = decodeURIComponent(pathname.split("/")[3] || "");
        if (!botId) return jsonResponse({ error: "Missing bot id" }, 400, cors);

        if (request.method === "GET") return handleBotGet(request, env, cors, auth, botId);
        if (request.method === "PATCH") return handleBotUpdate(request, env, cors, auth, botId, requestContext);
        if (request.method === "DELETE") return handleBotDelete(request, env, cors, auth, botId);
        return jsonResponse({ error: "Method not allowed" }, 405, cors);
      }

      if (pathname === "/api/files") {
        const { auth, response } = await getAuthOrUnauthorizedJwt(request, env, cors);
        if (response) return response;

        if (request.method === "GET") return handleFilesGet(request, env, cors, auth, url);
        if (request.method === "POST") return handleFilesCreate(request, env, cors, auth, requestContext);
        return jsonResponse({ error: "Method not allowed" }, 405, cors);
      }

      if (pathname.startsWith("/api/files/")) {
        const { auth, response } = await getAuthOrUnauthorizedJwt(request, env, cors);
        if (response) return response;

        const fileId = decodeURIComponent(pathname.split("/")[3] || "");
        if (!fileId) return jsonResponse({ error: "Missing file id" }, 400, cors);

        if (request.method === "DELETE") return handleFileDelete(request, env, cors, auth, fileId);
        return jsonResponse({ error: "Method not allowed" }, 405, cors);
      }

      if (pathname === "/api/conversations") {
        const { auth, response } = await getAuthOrUnauthorizedJwt(request, env, cors);
        if (response) return response;

        if (request.method === "GET") return handleConversationsGet(request, env, cors, auth, url);
        return jsonResponse({ error: "Method not allowed" }, 405, cors);
      }

      if (pathname === "/api/messages") {
        const { auth, response } = await getAuthOrUnauthorizedJwt(request, env, cors);
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
