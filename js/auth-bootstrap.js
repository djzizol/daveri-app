const AUTH_ENDPOINT = "/auth/me";

const ensureAuthReady = () => {
  if (typeof window === "undefined") {
    return Promise.resolve({ logged: false });
  }

  if (window.DaVeriAuth?.ready) {
    return window.DaVeriAuth.ready;
  }

  const ready = (async () => {
    const response = await fetch(AUTH_ENDPOINT, { credentials: "include" });
    if (!response.ok) {
      throw new Error("Not authenticated");
    }
    const data = await response.json();
    if (!data?.logged) {
      throw new Error("Not authenticated");
    }
    return data;
  })();

  window.DaVeriAuth = { ready };

  ready
    .then((data) => {
      window.DaVeriAuth.user = data.user;
      document.dispatchEvent(new CustomEvent("auth:ready", { detail: data }));
    })
    .catch((error) => {
      document.dispatchEvent(new CustomEvent("auth:failed", { detail: { error } }));
      const authScreen = document.getElementById("auth-screen");
      if (!authScreen) {
        window.location.href = "https://api.daveri.io/auth/google";
      }
    });

  return ready;
};

ensureAuthReady();
