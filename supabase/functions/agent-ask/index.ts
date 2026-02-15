import { createClient } from "npm:@supabase/supabase-js@2";

type Json = Record<string, unknown>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

// Tunables
const MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";
const MAX_HISTORY = Number(Deno.env.get("AGENT_MAX_HISTORY") ?? 12);
const LLM_TIMEOUT_MS = Number(Deno.env.get("AGENT_LLM_TIMEOUT_MS") ?? 25_000);
const LLM_RETRIES = Number(Deno.env.get("AGENT_LLM_RETRIES") ?? 1); // 0/1 sensownie

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "*";
  // jeśli chcesz stricte whitelistę, podmień origin na mapowanie listy domen
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-request-id, X-Request-ID",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Expose-Headers": "x-request-id, sb-request-id",
    "Vary": "Origin",
  };
}

function jsonResponse(req: Request, status: number, body: Json, extraHeaders: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(req),
      ...extraHeaders,
    },
  });
}

function getRequestId(req: Request) {
  return (
    req.headers.get("x-request-id") ||
    req.headers.get("X-Request-ID") ||
    crypto.randomUUID()
  );
}

async function safeJson(req: Request): Promise<any> {
  const text = await req.text();
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return Symbol.for("invalid_json");
  }
}

function requiredString(v: any): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function normalizePayload(body: any) {
  const bot_id =
    body?.bot_id ??
    body?.active_bot_id ??
    (Array.isArray(body?.selected_bot_ids) ? body.selected_bot_ids[0] : null);

  const question = body?.question ?? body?.message ?? null;
  const message = body?.message ?? body?.question ?? null;

  return {
    bot_id: requiredString(bot_id) ? bot_id : null,
    question: requiredString(question) ? question : null,
    message: requiredString(message) ? message : null,
    conversation_id: requiredString(body?.conversation_id) ? body.conversation_id : null,
    visitor_id: requiredString(body?.visitor_id) ? body.visitor_id : null,
    mode: requiredString(body?.mode) ? body.mode : null,
    meta: (body?.meta && typeof body.meta === "object") ? body.meta : {},
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort("timeout"), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function openaiChat(messages: Array<{ role: string; content: string }>, rid: string) {
  const payload = {
    model: MODEL,
    messages,
    temperature: 0.4,
  };

  let lastErr: any = null;

  for (let attempt = 0; attempt <= LLM_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
            "x-request-id": rid,
          },
          body: JSON.stringify(payload),
        },
        LLM_TIMEOUT_MS
      );

      const text = await res.text();
      if (!res.ok) {
        lastErr = { status: res.status, text: text.slice(0, 500) };
        // retry tylko na 429/5xx
        if (res.status === 429 || res.status >= 500) continue;
        throw new Error(`llm_failed:${res.status}`);
      }

      const json = JSON.parse(text);
      const answer = json?.choices?.[0]?.message?.content;
      if (!requiredString(answer)) throw new Error("llm_empty_answer");
      return answer;
    } catch (e) {
      lastErr = e;
      // retry tylko jeśli nie ostatnia próba
      if (attempt < LLM_RETRIES) continue;
      throw e;
    }
  }

  throw lastErr ?? new Error("llm_failed");
}

Deno.serve(async (req) => {
  const rid = getRequestId(req);

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse(req, 405, { error: "method_not_allowed", rid }, { "x-request-id": rid });
  }

  // Auth header
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse(req, 401, { error: "missing_bearer", rid }, { "x-request-id": rid });
  }

  // Parse body safely (tylko raz)
  const body = await safeJson(req);
  if (body === Symbol.for("invalid_json")) {
    return jsonResponse(req, 400, { error: "invalid_json", rid }, { "x-request-id": rid });
  }

  const p = normalizePayload(body);
  const missing: string[] = [];
  if (!p.bot_id) missing.push("bot_id");
  if (!p.question) missing.push("question");
  if (missing.length) {
    return jsonResponse(
      req,
      400,
      { error: "invalid_payload", missing, rid },
      { "x-request-id": rid }
    );
  }

  // User-level supabase client (RLS-friendly) — anon key + Authorization: Bearer <user_jwt>
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader, "x-request-id": rid } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Validate session + get user
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  const user = userData?.user;
  if (userErr || !user) {
    return jsonResponse(req, 401, { error: "invalid_session", rid }, { "x-request-id": rid });
  }

  // 1) Verify bot exists + user has access (RLS should enforce ownership in your schema)
  const { data: bot, error: botErr } = await supabase
    .from("bots")
    .select("id, system_prompt, name")
    .eq("id", p.bot_id)
    .single();

  if (botErr || !bot) {
    return jsonResponse(req, 404, { error: "bot_not_found", rid }, { "x-request-id": rid });
  }

  // 2) Load conversation history (if provided) else minimal
  // Zakładam tabelę public.agent_messages z kolumnami: conversation_id, role, content, created_at, user_id
  // Jeśli masz inne nazwy — podmień.
  let history: Array<{ role: string; content: string }> = [];
  if (p.conversation_id) {
    const { data: rows } = await supabase
      .from("agent_messages")
      .select("role, content, created_at")
      .eq("conversation_id", p.conversation_id)
      .order("created_at", { ascending: true })
      .limit(MAX_HISTORY);

    history = (rows ?? [])
      .filter(r => requiredString((r as any).role) && requiredString((r as any).content))
      .map(r => ({ role: (r as any).role, content: (r as any).content }));
  }

  // 3) Consume credit atomically (MUST be RPC; read+update = race)
  // RPC expected return: { allowed: boolean, reason?: text, usage: {daily_used, daily_cap, monthly_used, monthly_cap, day, month} }
  const { data: consumeData, error: consumeErr } = await supabase
    .rpc("daveri_agent_consume_credit", { p_cost: 1 });

  if (consumeErr) {
    return jsonResponse(
      req,
      500,
      { error: "credit_consume_failed", details: consumeErr.message, rid },
      { "x-request-id": rid }
    );
  }

  const allowed = (consumeData as any)?.allowed ?? false;
  const usage = (consumeData as any)?.usage ?? null;
  if (!allowed) {
    return jsonResponse(
      req,
      402,
      { error: "credit_limit_reached", usage, rid },
      { "x-request-id": rid }
    );
  }

  // 4) Persist USER message (best-effort)
  // Jeśli chcesz 100% spójności: zrób do tego osobny RPC atomic (conversation+message+usage)
  // Na razie: insert + opcjonalny update last_message_at.
  if (p.conversation_id) {
    await supabase.from("agent_messages").insert({
      conversation_id: p.conversation_id,
      user_id: user.id,
      role: "user",
      content: p.question,
      meta: { ...p.meta, visitor_id: p.visitor_id, rid },
    });
  }

  // 5) Compose messages for LLM
  const system = requiredString((bot as any).system_prompt)
    ? (bot as any).system_prompt
    : "You are a helpful AI sales agent. Answer succinctly and be action-oriented.";

  const llmMessages = [
    { role: "system", content: system },
    ...history,
    { role: "user", content: p.question! },
  ];

  // 6) Call LLM
  let answer: string;
  try {
    answer = await openaiChat(llmMessages, rid);
  } catch (e: any) {
    // optional refund (jeśli chcesz fair billing)
    // await supabase.rpc("daveri_agent_refund_credit", { p_cost: 1 }).catch(() => {});
    return jsonResponse(
      req,
      502,
      { error: "llm_failed", message: String(e?.message ?? e), rid },
      { "x-request-id": rid }
    );
  }

  // 7) Persist ASSISTANT message (best-effort)
  if (p.conversation_id) {
    await supabase.from("agent_messages").insert({
      conversation_id: p.conversation_id,
      user_id: user.id,
      role: "assistant",
      content: answer,
      meta: { bot_id: bot.id, bot_name: (bot as any).name ?? null, rid },
    });
  }

  return jsonResponse(
    req,
    200,
    {
      ok: true,
      rid,
      bot_id: bot.id,
      conversation_id: p.conversation_id,
      answer,
      usage,
    },
    { "x-request-id": rid }
  );
});
