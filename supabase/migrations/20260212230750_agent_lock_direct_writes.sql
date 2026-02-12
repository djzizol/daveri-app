-- Lock direct writes; enforce RPC-only write path

-- messages: immutable, only via RPC
revoke insert, update, delete on table public.agent_messages from authenticated;

-- usage: only via RPC
revoke insert, update, delete on table public.agent_usage_daily from authenticated;

-- conversations: allow update/select (title, preview), but no direct insert/delete
revoke insert, delete on table public.agent_conversations from authenticated;

