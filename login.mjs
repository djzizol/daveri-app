import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "http://127.0.0.1:54321",
  "eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwOi8vMTI3LjAuMC4xOjU0MzIxL2F1dGgvdjEiLCJzdWIiOiJhN2IyMTQxYy0zMmNiLTQxMmItOGNiYS1hZjk0NDEyY2YyZDQiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzcxMDg0MTQzLCJpYXQiOjE3NzEwODA1NDMsImVtYWlsIjoibWFsdWNoajg5QGdtYWlsLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWxfdmVyaWZpZWQiOnRydWV9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzcxMDgwNTQzfV0sInNlc3Npb25faWQiOiIxNTc0YTdiYy1iZTU1LTRkNTYtOWQwMi03N2E2OWNhZDNkMTMiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.fgsW5Hsid-t3G_6PlXQxD1URcvG_G91fU14XLxvP_x6topkk5H-2VbfCgu5SthPUeMcjwGnGEt4gAPby0yHDfw"
);

const { data, error } = await supabase.auth.signInWithPassword({
  email: "maluchj89@gmail.com",
  password: "dawid123"
});

if (error) {
  console.error("LOGIN ERROR:", error);
} else {
  console.log("JWT:");
  console.log(data.session.access_token);
}
