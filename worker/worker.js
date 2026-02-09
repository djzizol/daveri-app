export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // ============================
    // ✅ FIX #1: DYNAMIC CORS ORIGIN
    // ============================
    const origin = request.headers.get("Origin") || "https://daveri.io";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
      "Access-Control-Expose-Headers": "Set-Cookie"
    };
    
    // Handle OPTIONS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }
    
    // ============================
    // HEALTH CHECK
    // ============================
    if (url.pathname === "/health") {
      return new Response("OK", {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          ...cors
        }
      });
    }
    
    // ============================
    // GOOGLE LOGIN
    // ============================
    if (url.pathname === "/auth/google") {
      const params = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: "https://api.daveri.io/auth/callback",
        response_type: "code",
        scope: "openid email profile",
        access_type: "offline",
        prompt: "select_account",
        state: crypto.randomUUID()
      });
      
      return Response.redirect(
        "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString(),
        302
      );
    }
    
    // ============================
    // GOOGLE CALLBACK
    // ============================
    if (url.pathname === "/auth/callback") {
      try {
        const code = url.searchParams.get("code");
        
        if (!code) {
          return new Response("Missing code", { status: 400 });
        }
        
        // Exchange code for token
        const tokenRes = await fetch(
          "https://oauth2.googleapis.com/token",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
              code,
              client_id: env.GOOGLE_CLIENT_ID,
              client_secret: env.GOOGLE_CLIENT_SECRET,
              redirect_uri: "https://api.daveri.io/auth/callback",
              grant_type: "authorization_code"
            })
          }
        );
        
        const tokenData = await tokenRes.json();
        
        if (!tokenData.access_token) {
          console.log("TOKEN ERROR:", tokenData);
          return new Response(
            JSON.stringify(tokenData),
            {
              status: 500,
              headers: {
                "Content-Type": "application/json"
              }
            }
          );
        }
        
        // Get profile
        const userRes = await fetch(
          "https://www.googleapis.com/oauth2/v2/userinfo",
          {
            headers: {
              Authorization: "Bearer " + tokenData.access_token
            }
          }
        );
        
        const profile = await userRes.json();
        
        if (!profile.email) {
          return new Response("Invalid profile", { status: 500 });
        }
        
        // Save to Supabase
        await fetch(
          env.SUPABASE_URL + "/rest/v1/users",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
              "Authorization": "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
              "Prefer": "resolution=merge-duplicates"
            },
            body: JSON.stringify({
              email: profile.email,
              name: profile.name,
              avatar_url: profile.picture,
              provider: "google"
            })
          }
        );
        
        // Create session
        const session = btoa(JSON.stringify({
          email: profile.email,
          name: profile.name,
          picture: profile.picture,
          created: Date.now()
        }));
        
        // ============================
        // ✅ FIX #2: DODAJ PARAMETR LUB SPECJALNY REDIRECT
        // ============================
        // Możesz dodać flagę, że login się udał
        const redirectUrl = "https://daveri.io/?auth_success=1";
        
        return new Response(null, {
          status: 302,
          headers: {
            ...cors,
            // Redirect z flagą sukcesu
            "Location": redirectUrl,
            
            // ✅ CRITICAL: Domain cookie dla wszystkich subdomen
            "Set-Cookie":
              "session=" + session +
              "; Domain=.daveri.io; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000"
          }
        });
        
      } catch (e) {
        console.log("CALLBACK ERROR:", e);
        return new Response("Auth failed", { status: 500 });
      }
    }
    
    // ============================
    // GET SESSION (/auth/me)
    // ============================
    if (url.pathname === "/auth/me") {
      const cookie = request.headers.get("Cookie") || "";
      const match = cookie.match(/session=([^;]+)/);
      
      if (!match) {
        return new Response(
          JSON.stringify({ logged: false }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              ...cors
            }
          }
        );
      }
      
      try {
        const user = JSON.parse(atob(match[1]));
        
        return new Response(
          JSON.stringify({
            logged: true,
            user
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              ...cors
            }
          }
        );
        
      } catch {
        return new Response(
          JSON.stringify({ logged: false }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              ...cors
            }
          }
        );
      }
    }
    
    // ============================
    // LOGOUT
    // ============================
    if (url.pathname === "/auth/logout") {
      return new Response(null, {
        status: 302,
        headers: {
          ...cors,
          "Location": "https://daveri.io",
          "Set-Cookie":
            "session=; Domain=.daveri.io; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0"
        }
      });
    }
    
    // ============================
    // NOT FOUND
    // ============================
    return new Response(
      JSON.stringify({
        error: "Not found"
      }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          ...cors
        }
      }
    );
  }
};