// supabase/functions/agent-ask/index.ts
// DaVeri — Agent Ask (MAX runtime: validation + idempotency + logs + timeouts + OpenAI-compatible LLM)
//
// ENV required:
// - SUPABASE_URL
// - SUPABASE_ANON_KEY
// Optional but recommended:
// - SUPABASE_SERVICE_ROLE_KEY (for deterministic ownership checks without leaking bot existence)
// LLM (OpenAI-compatible):
// - LLM_API_KEY
// - LLM_BASE_URL (default: https://api.openai.com/v1)
// - LLM_MODEL_DEFAULT (default: gpt-4o-mini or your choice)
// - LLM_TIMEOUT_MS (default: 30000)
//
// DB assumptions (adjust if needed):
// - bots: id, owner_user_id, name, llm_model, system_prompt, temperature, max_output_tokens
// - conversations: id, bot_id, owner_user_id, created_at
// - messages: id, conversation_id, role, content, created_at, request_id (TEXT), usage (JSONB), meta (JSONB)
//
// MUST HAVE RPC (Stage 4 foundation):
// - public.daveri_agent_consume_credit(p_bot_id uuid, p_conversation_id uuid, p_request_id text, p_units int)
//   returns json { ok bool, code text, message text, ... }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://esm.sh/zod@3.23.8";

type Json = Record<string, unknown>;

type ErrorCode =
  | "invalid_json"
  | "invalid_auth"
  | "invalid_payload"
  | "not_found"
  | "forbidden"
  | "no_credits"
  | "rate_limited"
  | "upstream_llm_failed"
  | "internal";

type ApiError = {
  ok: false;
  request_id: string;
  error: {
    code: ErrorCode;
    message: string;
    details?: Json;
  };
};

type ApiOk = {
  ok: true;
  request_id: string;
  data: {
    conversation_id: string;
    answer: string;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
    debug?: {
      timing_ms: number;
      llm_ms?: number;
      history_count?: number;
      idempotent_hit?: boolean;
    };
  };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-request-id",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BodySchema = z.object({
  bot_id: z.string().refine((v) => UUID_RE.test(v), "bot_id must be uuid"),
  question: z.string().min(1).max(8000).optional(),
  message: z.string().min(1).max(8000).optional(),
  conversation_id: z.string().refine((v) => UUID_RE.test(v), "conversation_id must be uuid").optional(),
  // optional knobs (controlled)
  meta: z.record(z.any()).optional(),
}).refine((v) => (v.question ?? v.message)?.trim()?.length, {
  message: "Missing question/message",
  path: ["question"],
});

function nowMs() {
  return Date.now();
}

function getRequestId(req: Request): string {
  const rid = req.headers.get("x-request-id");
  return (rid && rid.trim().length <= 128) ? rid.trim() : crypto.randomUUID();
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function jsonResponse(body: ApiOk | ApiError, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "x-request-id": (body as any).request_id,
    },
  });
}

function err(
  request_id: string,
  code: ErrorCode,
  message: string,
  status: number,
  details?: Json,
): Response {
  const payload: ApiError = {
    ok: false,
    request_id,
    error: { code, message, ...(details ? { details } : {}) },
  };
  return jsonResponse(payload, status);
}

function log(level: "info" | "warn" | "error", request_id: string, msg: string, data?: Json) {
  // Structured logs (Cloudflare / Supabase logs-friendly)
  const out = {
    level,
    ts: new Date().toISOString(),
    request_id,
    msg,
    ...(data ? { data } : {}),
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out));
}

// Safety / abuse limits
const MAX_CONTENT_LENGTH = 256 * 1024; // 256KB
const HISTORY_LIMIT = 24; // keep it tight; stage 6 can do smarter retrieval
const HISTORY_MAX_CHARS = 45_000; // guardrail
const QUESTION_MAX_CHARS = 8_000;

// Basic helper: read JSON only once + enforce content-length if provided
async function readJsonOnce(req: Request) {
  const cl = req.headers.get("content-length");
  if (cl) {
    const n = Number(cl);
    if (Number.isFinite(n) && n > MAX_CONTENT_LENGTH) {
      throw new Error(`payload_too_large:${n}`);
    }
  }
  return await req.json();
}

function trimHistoryByChars(
  msgs: Array<{ role: "user" | "assistant"; content: string }>,
  maxChars: number,
) {
  // Keep the most recent messages within maxChars
  let total = 0;
  const kept: typeof msgs = [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const c = msgs[i].content ?? "";
    const add = c.length;
    if (total + add > maxChars) break;
    kept.push(msgs[i]);
    total += add;
  }
  kept.reverse();
  return kept;
}

async function callOpenAICompatibleLLM(opts: {
  request_id: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  timeoutMs: number;
}): Promise<{ answer: string; usage?: ApiOk["data"]["usage"] }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort("timeout"), opts.timeoutMs);

  try {
    const res = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${opts.apiKey}`,
        "x-request-id": opts.request_id,
      },
      body: JSON.stringify({
        model: opts.model,
        temperature: opts.temperature,
        max_tokens: opts.maxOutputTokens,
        messages: opts.messages,
      }),
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // keep raw
    }

    if (!res.ok) {
      throw new Error(
        `llm_http_${res.status}:${json?.error?.message ?? text?.slice?.(0, 300) ?? "unknown"}`,
      );
    }

    const answer =
      json?.choices?.[0]?.message?.content ??
      json?.choices?.[0]?.text ??
      "";

    if (!answer || typeof answer !== "string") {
      throw new Error("llm_empty_answer");
    }

    const usage = json?.usage
      ? {
          prompt_tokens: json.usage.prompt_tokens,
          completion_tokens: json.usage.completion_tokens,
          total_tokens: json.usage.total_tokens,
        }
      : undefined;

    return { answer, usage };
  } finally {
    clearTimeout(t);
  }
}

serve(async (req) => {
  const started = nowMs();
  const request_id = getRequestId(req);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...corsHeaders, "x-request-id": request_id },
    });
  }

  if (req.method !== "POST") {
    return err(request_id, "invalid_payload", "Method not allowed", 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return err(request_id, "internal", "Missing SUPABASE_URL / SUPABASE_ANON_KEY", 500);
  }

  // Parse + validate body
  let rawBody: any;
  try {
    rawBody = await readJsonOnce(req);
  } catch (e) {
    const msg = String(e);
    if (msg.startsWith("Error: payload_too_large:")) {
      return err(request_id, "invalid_payload", "Payload too large", 413, { message: msg });
    }
    return err(request_id, "invalid_json", "Invalid JSON body", 400, { message: msg });
  }

  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return err(request_id, "invalid_payload", "Invalid payload", 400, {
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }

  const body = parsed.data;
  const bot_id = body.bot_id;
  const question = (body.question ?? body.message ?? "").trim().slice(0, QUESTION_MAX_CHARS);
  const conversation_id_in = body.conversation_id;

  // Auth
  const token = getBearerToken(req);
  if (!token) {
    return err(request_id, "invalid_auth", "Missing Authorization: Bearer <token>", 401);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const adminClient = SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null;

  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return err(request_id, "invalid_auth", "Invalid JWT", 401, {
      supabase_error: userErr?.message,
    });
  }

  // Resolve internal_user_id (your established SSoT mapping)
  const { data: internalId, error: internalErr } = await userClient.rpc("daveri_internal_user_id");
  if (internalErr || !internalId) {
    return err(request_id, "internal", "Failed to resolve internal user id", 500, {
      supabase_error: internalErr?.message,
    });
  }
  const internal_user_id = internalId as string;

  // Load bot + ownership check
  let bot: any = null;
  {
    // Try RLS path first
    const { data, error } = await userClient
      .from("bots")
      .select("id, owner_user_id, name, llm_model, system_prompt, temperature, max_output_tokens")
      .eq("id", bot_id)
      .maybeSingle();

    if (!error && data) {
      bot = data;
    } else if (adminClient) {
      const { data: aData, error: aErr } = await adminClient
        .from("bots")
        .select("id, owner_user_id, name, llm_model, system_prompt, temperature, max_output_tokens")
        .eq("id", bot_id)
        .maybeSingle();

      if (aErr) {
        return err(request_id, "internal", "Failed to load bot", 500, { supabase_error: aErr.message });
      }
      if (!aData) {
        return err(request_id, "not_found", "Bot not found", 404);
      }
      if (aData.owner_user_id !== internal_user_id) {
        return err(request_id, "forbidden", "Bot does not belong to user", 403);
      }
      bot = aData;
    } else {
      // no admin fallback: don't leak existence
      return err(request_id, "not_found", "Bot not found", 404);
    }
  }

  // Conversation: verify or create
  let conversation_id = conversation_id_in ?? null;

  if (conversation_id) {
    const { data, error } = await userClient
      .from("conversations")
      .select("id, bot_id, owner_user_id")
      .eq("id", conversation_id)
      .maybeSingle();

    if (error || !data) {
      return err(request_id, "not_found", "Conversation not found", 404);
    }
    if (data.bot_id !== bot_id || data.owner_user_id !== internal_user_id) {
      return err(request_id, "forbidden", "Conversation does not belong to user/bot", 403);
    }
  } else {
    const { data, error } = await userClient
      .from("conversations")
      .insert({ bot_id, owner_user_id: internal_user_id })
      .select("id")
      .single();

    if (error || !data?.id) {
      return err(request_id, "internal", "Failed to create conversation", 500, { supabase_error: error?.message });
    }
    conversation_id = data.id as string;
  }

  // IDEMPOTENCY: if we already produced assistant answer for this request_id -> return it
  // Requires messages.request_id column (TEXT) indexed ideally.
  {
    const { data: existing, error } = await userClient
      .from("messages")
      .select("role, content, usage")
      .eq("conversation_id", conversation_id)
      .eq("request_id", request_id)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && existing?.content) {
      const resp: ApiOk = {
        ok: true,
        request_id,
        data: {
          conversation_id,
          answer: String(existing.content),
          usage: (existing.usage ?? undefined) as any,
          debug: {
            timing_ms: nowMs() - started,
            idempotent_hit: true,
          },
        },
      };
      return jsonResponse(resp, 200);
    }
  }

  // Stage 4 hook: atomic credit consumption (must be idempotent by request_id)
  const consumeUnits = 1;
  const { data: consumeRes, error: consumeErr } = await userClient.rpc(
    "daveri_agent_consume_credit",
    {
      p_bot_id: bot_id,
      p_conversation_id: conversation_id,
      p_request_id: request_id,
      p_units: consumeUnits,
    },
  );

  if (consumeErr) {
    return err(request_id, "internal", "Credit consume RPC failed", 500, {
      supabase_error: consumeErr.message,
      hint: "Implement public.daveri_agent_consume_credit(...) as atomic + idempotent by request_id.",
    });
  }
  if (consumeRes && typeof consumeRes === "object") {
    const ok = (consumeRes as any).ok;
    const code = (consumeRes as any).code;
    if (ok === false && code === "no_credits") {
      return err(request_id, "no_credits", "No credits remaining", 402, { credit: consumeRes });
    }
    if (ok === false && code === "rate_limited") {
      return err(request_id, "rate_limited", "Rate limited", 429, { credit: consumeRes });
    }
  }

  // Load history
  const { data: historyRows, error: historyErr } = await userClient
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversation_id)
    .order("created_at", { ascending: true })
    .limit(HISTORY_LIMIT);

  if (historyErr) {
    return err(request_id, "internal", "Failed to load conversation history", 500, {
      supabase_error: historyErr.message,
    });
  }

  const history = (historyRows ?? [])
    .filter((m: any) => m?.role === "user" || m?.role === "assistant")
    .map((m: any) => ({ role: m.role as "user" | "assistant", content: String(m.content ?? "") }));

  const trimmedHistory = trimHistoryByChars(history, HISTORY_MAX_CHARS);

  // Persist user message (idempotent-ish by (conversation_id, request_id, role='user') if you add a unique index)
  const meta: Json = {
    request_id,
    bot_id,
    internal_user_id,
    cf: {
      ray: req.headers.get("cf-ray"),
      ip: req.headers.get("cf-connecting-ip"),
      country: req.headers.get("cf-ipcountry"),
    },
    ua: req.headers.get("user-agent"),
    input_meta: body.meta ?? {},
  };

  {
    const { error: insUserErr } = await userClient.from("messages").insert({
      conversation_id,
      role: "user",
      content: question,
      request_id,
      meta,
    } as any);

    if (insUserErr) {
      // If you later add unique constraint and we hit duplicate -> proceed (idempotent retry)
      const m = insUserErr.message ?? "";
      if (!m.toLowerCase().includes("duplicate")) {
        return err(request_id, "internal", "Failed to persist user message", 500, {
          supabase_error: insUserErr.message,
        });
      }
    }
  }

  // Build prompt
  const system =
    (bot.system_prompt as string | null) ??
    "You are DaVeri AI Sales Agent. Be concise, accurate, and action-oriented. Ask clarifying questions only when necessary.";

  const llmMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: system },
    ...trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: question },
  ];

  // LLM config
  const LLM_API_KEY = Deno.env.get("LLM_API_KEY");
  const LLM_BASE_URL = Deno.env.get("LLM_BASE_URL") ?? "https://api.openai.com/v1";
  const LLM_MODEL_DEFAULT = Deno.env.get("LLM_MODEL_DEFAULT") ?? "gpt-4o-mini";
  const LLM_TIMEOUT_MS = Number(Deno.env.get("LLM_TIMEOUT_MS") ?? "30000");

  const model = (bot.llm_model as string | null) ?? LLM_MODEL_DEFAULT;
  const temperature = Math.max(0, Math.min(1.2, Number(bot.temperature ?? 0.2)));
  const maxOutputTokens = Math.max(64, Math.min(2048, Number(bot.max_output_tokens ?? 512)));

  if (!LLM_API_KEY) {
    // Hard-fail: runtime exists but provider not configured
    return err(request_id, "internal", "LLM not configured (missing LLM_API_KEY)", 500);
  }

  // Call LLM
  let answer = "";
  let usage: ApiOk["data"]["usage"] | undefined;
  const llmStart = nowMs();

  try {
    const llm = await callOpenAICompatibleLLM({
      request_id,
      baseUrl: LLM_BASE_URL,
      apiKey: LLM_API_KEY,
      model,
      temperature,
      maxOutputTokens,
      messages: llmMessages,
      timeoutMs: Number.isFinite(LLM_TIMEOUT_MS) ? LLM_TIMEOUT_MS : 30000,
    });
    answer = llm.answer;
    usage = llm.usage;
  } catch (e) {
    log("error", request_id, "LLM call failed", {
      bot_id,
      conversation_id,
      model,
      error: String(e),
    });
    return err(request_id, "upstream_llm_failed", "LLM call failed", 502, { message: String(e) });
  }

  // Persist assistant message (this is the idempotency anchor)
  {
    const { error: insAsstErr } = await userClient.from("messages").insert({
      conversation_id,
      role: "assistant",
      content: answer,
      request_id,
      usage: usage ?? null,
      meta: {
        ...meta,
        llm: {
          model,
          temperature,
          max_output_tokens: maxOutputTokens,
          base_url: LLM_BASE_URL,
        },
      },
    } as any);

    if (insAsstErr) {
      const m = insAsstErr.message ?? "";
      // If duplicate due to retry -> fetch and return existing
      if (m.toLowerCase().includes("duplicate")) {
        const { data: existing } = await userClient
          .from("messages")
          .select("content, usage")
          .eq("conversation_id", conversation_id)
          .eq("request_id", request_id)
          .eq("role", "assistant")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing?.content) {
          answer = String(existing.content);
          usage = (existing.usage ?? undefined) as any;
        }
      } else {
        return err(request_id, "internal", "Failed to persist assistant message", 500, {
          supabase_error: insAsstErr.message,
        });
      }
    }
  }

  const timing_ms = nowMs() - started;
  const llm_ms = nowMs() - llmStart;

  log("info", request_id, "agent_ask_ok", {
    bot_id,
    conversation_id,
    timing_ms,
    llm_ms,
    history_count: trimmedHistory.length,
    usage,
  });

  const ok: ApiOk = {
    ok: true,
    request_id,
    data: {
      conversation_id,
      answer,
      usage,
      debug: {
        timing_ms,
        llm_ms,
        history_count: trimmedHistory.length,
      },
    },
  };

  return jsonResponse(ok, 200);
});
