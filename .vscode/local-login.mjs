import { createClient } from "@supabase/supabase-js";

const url = "http://127.0.0.1:54321";                 // Project URL z supabase status
const anon = process.env.eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0;           // weź z `supabase status` (anon key) albo z configu

if (!anon) {
  console.error("Set SUPABASE_ANON_KEY env first");
  process.exit(1);
}

const supabase = createClient(url, anon);

const email = process.env.EMAIL;
const password = process.env.PASSWORD;
if (!email || !password) {
  console.error("Set EMAIL and PASSWORD env vars");
  process.exit(1);
}

const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) {
  console.error("login error:", error.message);
  process.exit(1);
}

console.log(data.session.access_token);
