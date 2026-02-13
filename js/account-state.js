import {
  applyPlanUpgrade as applyCreditsPlanUpgrade,
  consumeMessageCredit as consumeCreditsMessage,
  getCreditStatus,
  subscribeCreditUpdates,
} from "./credits.js";
import {
  getEntitlementsMap,
  subscribeEntitlementsUpdates,
} from "./entitlements.js";

const ACCOUNT_UPDATED_EVENT = "daveri:account-state-updated";

if (typeof window !== "undefined") {
  window.DaVeriAccountState = window.DaVeriAccountState || {
    credits: null,
    entitlements_map: {},
    ready: false,
  };
}

const accountState = {
  ready: false,
  user_id: null,
  credits: null,
  entitlements_map: {},
  loaded_at: null,
};

let ensurePromise = null;

const syncGlobalAccountState = () => {
  if (typeof window === "undefined") return;
  window.DaVeriAccountState = window.DaVeriAccountState || {
    credits: null,
    entitlements_map: {},
    ready: false,
  };
  window.DaVeriAccountState.credits = accountState.credits ? { ...accountState.credits } : null;
  window.DaVeriAccountState.entitlements_map = { ...(accountState.entitlements_map || {}) };
  window.DaVeriAccountState.ready = accountState.ready === true;
};

const cloneState = () => ({
  ready: accountState.ready,
  user_id: accountState.user_id,
  credits: accountState.credits ? { ...accountState.credits } : null,
  entitlements_map: { ...(accountState.entitlements_map || {}) },
  loaded_at: accountState.loaded_at,
});

const emitState = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(ACCOUNT_UPDATED_EVENT, {
      detail: { state: cloneState() },
    })
  );
};

const setState = (patch) => {
  Object.assign(accountState, patch || {});
  accountState.loaded_at = new Date().toISOString();
  syncGlobalAccountState();
  emitState();
};

const resolveUserId = () => {
  const fromAuth = window?.DaVeriAuth?.session?.user?.id;
  if (typeof fromAuth === "string" && fromAuth.trim()) return fromAuth.trim();
  const fromSidebar = document.getElementById("daveri_sidebar")?.dataset?.userId;
  if (typeof fromSidebar === "string" && fromSidebar.trim()) return fromSidebar.trim();
  return null;
};

const waitForAuthReady = async () => {
  if (typeof window === "undefined") return false;

  const authReady = window?.DaVeriAuth?.ready;
  if (authReady && typeof authReady.then === "function") {
    try {
      await authReady;
      return true;
    } catch {
      return false;
    }
  }

  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      resolve(Boolean(ok));
    };

    document.addEventListener("auth:ready", () => finish(true), { once: true });
    document.addEventListener("auth:failed", () => finish(false), { once: true });
    window.setTimeout(() => finish(Boolean(window?.DaVeriAuth?.session?.user)), 1800);
  });
};

export const getAccountState = () => cloneState();

export const refreshCredits = async () => {
  const credits = await getCreditStatus();
  setState({
    credits: credits || null,
    user_id: resolveUserId(),
  });
  return credits;
};

export const refreshEntitlements = async () => {
  const entitlementsMap = await getEntitlementsMap();
  setState({
    entitlements_map: entitlementsMap || {},
    user_id: resolveUserId(),
  });
  return entitlementsMap;
};

export const ensureAccountState = async () => {
  if (accountState.ready) return cloneState();
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    const authReady = await waitForAuthReady();
    if (!authReady) {
      setState({ ready: false, user_id: null, credits: null, entitlements_map: {} });
      return cloneState();
    }

    let creditsStatus = null;
    let entitlementsMap = {};

    try {
      [creditsStatus, entitlementsMap] = await Promise.all([
        getCreditStatus().catch(() => null),
        getEntitlementsMap().catch(() => ({})),
      ]);
    } finally {
      if (typeof window !== "undefined") {
        window.DaVeriAccountState.credits = creditsStatus;
        window.DaVeriAccountState.entitlements_map = entitlementsMap || {};
        window.DaVeriAccountState.ready = true;
      }
      setState({
        ready: true,
        user_id: resolveUserId(),
        credits: creditsStatus || null,
        entitlements_map: entitlementsMap || {},
      });
    }

    return cloneState();
  })()
    .finally(() => {
      ensurePromise = null;
    });

  return ensurePromise;
};

export const consumeMessageCredit = async (amount = 1, userId = null) => {
  const result = await consumeCreditsMessage(amount, userId);
  if (result?.status) {
    setState({
      credits: result.status,
      user_id: resolveUserId(),
    });
  }
  return result;
};

export const applyPlanUpgrade = async (newPlanId = "premium") => {
  const result = await applyCreditsPlanUpgrade(newPlanId);
  const [credits, entitlementsMap] = await Promise.all([
    getCreditStatus().catch(() => result?.status || null),
    getEntitlementsMap().catch(() => accountState.entitlements_map || {}),
  ]);

  setState({
    ready: true,
    user_id: resolveUserId(),
    credits: credits || result?.status || null,
    entitlements_map: entitlementsMap || accountState.entitlements_map || {},
  });

  return {
    ...result,
    entitlements_map: entitlementsMap || {},
  };
};

export const subscribeAccountState = (listener) => {
  if (typeof window === "undefined" || typeof listener !== "function") {
    return () => {};
  }

  const handler = (event) => {
    listener(event?.detail?.state || cloneState(), event);
  };

  window.addEventListener(ACCOUNT_UPDATED_EVENT, handler);
  return () => window.removeEventListener(ACCOUNT_UPDATED_EVENT, handler);
};

if (typeof window !== "undefined") {
  subscribeCreditUpdates((credits) => {
    if (!credits) return;
    setState({
      credits,
      user_id: resolveUserId(),
      ready: true,
    });
  });

  subscribeEntitlementsUpdates((entitlementsMap) => {
    setState({
      entitlements_map: entitlementsMap || {},
      user_id: resolveUserId(),
      ready: true,
    });
  });

  document.addEventListener("auth:ready", () => {
    void ensureAccountState();
  });

  window.DaVeriAccount = {
    ensureLoaded: ensureAccountState,
    getState: getAccountState,
    refreshCredits,
    refreshEntitlements,
    consumeMessageCredit,
    applyPlanUpgrade,
    subscribe: subscribeAccountState,
  };

  void ensureAccountState();
}
