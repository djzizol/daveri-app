import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // 1) Parse body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const bot_id = body?.bot_id ?? body?.active_bot_id ?? (Array.isArray(body?.selected_bot_ids) ? body.selected_bot_ids[0] : null);
  const question = body?.question ?? body?.message;

  if (!bot_id || !question || String(question).trim().length === 0) {
    return json(400, {
      error: "invalid_payload",
      required: ["bot_id", "question"],
      got: {
        bot_id: !!bot_id,
        question: typeof question === "string" ? question.length : null,
      },
    });
  }

  // 2) Auth (skip if serve --no-verify-jwt, but allow if provided)
  const auth = req.headers.get("authorization") ?? "";
  const hasBearer = auth.toLowerCase().startsWith("bearer ");

  // Build Supabase client (works with or without bearer; with bearer enables RPC requiring session)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: hasBearer ? { Authorization: auth } : {} } }
  );

  // 3) If bearer provided, verify user + try credit RPC (your canonical source)
  let user_id: string | null = null;
  let usage: any = null;

  if (hasBearer) {
    const { data: u, error: uerr } = await supabase.auth.getUser();
    if (uerr || !u?.user) return json(401, { error: "invalid_session" });
    user_id = u.user.id;

    const { data, error } = await supabase.rpc("daveri_agent_credit_status");
    if (!error) usage = data; // if error, we still return ok (useful for local debugging)
  }

  // 4) MVP response (no LLM yet)
  return json(200, {
    ok: true,
    bot_id,
    question,
    question_len: String(question).length,
    user_id,
    usage,
  });
});
