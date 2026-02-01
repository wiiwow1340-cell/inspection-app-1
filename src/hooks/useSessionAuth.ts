import { useEffect, useRef, useState } from "react";
import { logAudit } from "../services/auditService";
import { supabase } from "../services/supabaseClient";

const SINGLE_LOGIN_LOCAL_KEY = "single_login_session_id";

function getOrCreateLocalLoginSessionId() {
  const existing = localStorage.getItem(SINGLE_LOGIN_LOCAL_KEY);
  if (existing) return existing;
  const sid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(SINGLE_LOGIN_LOCAL_KEY, sid);
  return sid;
}

async function upsertLoginLockForCurrentUser(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return false;

  const sid = getOrCreateLocalLoginSessionId();

  const { error } = await supabase.from("user_login_lock").upsert({
    user_id: session.user.id,
    session_id: sid,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("寫入 user_login_lock 失敗：", error.message || error);
    return false;
  }
  return true;
}

async function isCurrentSessionStillValid(opts: { enabled: boolean; loginAtMs: number }): Promise<boolean> {
  // 若登入時寫入 lock 失敗，就不要強制單一登入（避免誤登出）
  if (!opts.enabled) return true;

  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return false;

  const sid = localStorage.getItem(SINGLE_LOGIN_LOCAL_KEY) || "";
  if (!sid) return true; // 沒有本機 sid 時先不擋（避免誤踢）

  const { data: lock, error } = await supabase
    .from("user_login_lock")
    .select("session_id, updated_at")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error) {
    console.error("讀取 user_login_lock 失敗：", error.message || error);
    return true; // 讀不到就先不擋，避免全站不能用
  }

  if (!lock?.session_id) return true;

  // 正常相同：有效
  if (lock.session_id === sid) return true;

  // 不同：判斷這筆 lock 是否比「本次登入時間」更新
  const lockUpdatedAt = lock.updated_at ? Date.parse(lock.updated_at) : 0;
  const loginAt = opts.loginAtMs || 0;

  // 若 lock 比本次登入舊很多，通常代表：登入時 lock 寫入失敗 / DB 還停留在舊 session
  // 這種情境下不應該誤踢人；先嘗試補寫一次 lock
  if (loginAt && lockUpdatedAt && lockUpdatedAt < loginAt - 5000) {
    const repaired = await upsertLoginLockForCurrentUser();
    if (repaired) return true;
    // 補寫失敗也不要直接踢人，避免「儲存成功後誤登出」
    return true;
  }

  // lock 比本次登入更新（或沒有可靠時間可比）：視為其他裝置登入，踢人
  return false;
}

type UseSessionAuthOptions = {
  onLogoutCleanup: (options: { clearDraft: boolean }) => Promise<void>;
  onKickedCleanup: () => Promise<void>;
};

export function useSessionAuth({
  onLogoutCleanup,
  onKickedCleanup,
}: UseSessionAuthOptions) {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authUsername, setAuthUsername] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [idleLogoutMessage, setIdleLogoutMessage] = useState("");
  const kickedRef = useRef(false);
  const skipSingleLoginCheckRef = useRef(false);
  // 單一登入鎖是否已成功寫入（寫入失敗時，不強制踢人，避免誤登出）
  const singleLoginReadyRef = useRef(false);
  // 記錄本次登入時間（用來判斷 DB lock 是否比本機登入更新）
  const loginAtRef = useRef<number>(0);
  const idleTimerRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // ===== 權限判斷：Admin 白名單（可用 VITE_ADMIN_USERS 設定） =====
  const computeIsAdmin = (u: string) => {
    return u === "admin";
  };

  const refreshUserRole = async () => {
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email || "";
    const u = email.includes("@") ? email.split("@")[0] : "";
    setAuthUsername(u);
    setIsAdmin(computeIsAdmin(u));
  };

  const handleKickedOut = async () => {
    if (kickedRef.current) return;
    kickedRef.current = true;
    alert("此帳號已在其他裝置登入，系統將登出。");
    // 不 await，避免卡住 UI（有時 signOut 會卡在網路或 SDK 狀態）
    supabase.auth.signOut();
    await onKickedCleanup();
    setIsLoggedIn(false);
    setAuthUsername("");
    setIsAdmin(false);
  };

  const handleLogout = async (options?: { clearDraft?: boolean }) => {
    const clearDraft = options?.clearDraft ?? true;
    await supabase.auth.signOut();
    await onLogoutCleanup({ clearDraft });
    setIsLoggedIn(false);
    setAuthUsername("");
    setIsAdmin(false);
  };

  const pauseSingleLoginValidation = () => {
    skipSingleLoginCheckRef.current = true;
  };

  const resumeSingleLoginValidation = () => {
    skipSingleLoginCheckRef.current = false;
  };

  const login = async (username: string, password: string) => {
    const trimmed = username.trim();
    if (!trimmed || !password) {
      return { ok: false, message: "請輸入帳號與密碼" };
    }

    const email = `${trimmed}@local.com`;

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { ok: false, message: error.message || "登入失敗" };
    }

        loginAtRef.current = Date.now();
    singleLoginReadyRef.current = await upsertLoginLockForCurrentUser();
    if (!singleLoginReadyRef.current) {
      console.warn("user_login_lock 未寫入成功：將暫停單一登入強制踢人（避免誤登出）。");
    }
    setIdleLogoutMessage("");
    setIsLoggedIn(true);
    await logAudit("login");
    return { ok: true };
  };

  // ===== 登入狀態初始化（Supabase Session） =====
  useEffect(() => {
    let cancelled = false;

    // ✅ 保險：任何情況都不要讓畫面永久卡在 Loading
    const failSafe = window.setTimeout(() => {
      if (!cancelled) setSessionChecked(true);
    }, 4000);

    const initAuth = async () => {
      try {
        // ✅ 再加一層 timeout：避免極端情況 getSession Promise 卡住
        const sessionRes: any = await Promise.race([
          supabase.auth.getSession(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("getSession timeout")), 3000)
          ),
        ]);

        const data = sessionRes?.data;
        const error = sessionRes?.error;

        if (error) {
          console.error("getSession 失敗：", error.message || error);
        }

        const hasSession = !!data?.session;

        if (!cancelled) {
          setIsLoggedIn(hasSession);
        }

        if (hasSession) {
          setIdleLogoutMessage("");
          // ⚠️ 不要讓 refreshUserRole 阻塞 sessionChecked
          refreshUserRole().catch((e) => {
            console.error("refreshUserRole 失敗：", e);
          });
        } else {
          if (!cancelled) {
            setAuthUsername("");
            setIsAdmin(false);
          }
        }
      } catch (e) {
        console.error("initAuth 失敗：", e);
        if (!cancelled) {
          setIsLoggedIn(false);
          setAuthUsername("");
          setIsAdmin(false);
        }
      } finally {
        window.clearTimeout(failSafe);
        if (!cancelled) setSessionChecked(true);
      }
    };

    initAuth();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        // ✅ 狀態先更新，不要被 refreshUserRole 卡住
        setIsLoggedIn(!!session);
        setSessionChecked(true);

        if (session) {
          setIdleLogoutMessage("");
          refreshUserRole().catch((e) => {
            console.error("refreshUserRole 失敗：", e);
          });
        } else {
          setAuthUsername("");
          setIsAdmin(false);
        }
      }
    );

    return () => {
      cancelled = true;
      window.clearTimeout(failSafe);
      listener?.subscription.unsubscribe();
    };
  }, []);

  // ===== 單一登入鎖：已登入時定期檢查（後登入踢前登入） =====
  useEffect(() => {
    if (!isLoggedIn) {
      kickedRef.current = false;
      return;
    }

    kickedRef.current = false;
    const timer = window.setInterval(async () => {
      if (skipSingleLoginCheckRef.current) return;
      const ok = await isCurrentSessionStillValid({ enabled: singleLoginReadyRef.current, loginAtMs: loginAtRef.current });
      if (!ok) {
        await handleKickedOut();
      }
    }, 3000);

    return () => window.clearInterval(timer);
  }, [isLoggedIn]);

  // ===== 閒置自動登出（5 分鐘無操作） =====
  useEffect(() => {
    if (!isLoggedIn) {
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      return;
    }

    const idleTimeoutMs = 5 * 60 * 1000;
    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "touchmove",
      "wheel",
      "scroll",
      "pointerdown",
      "pointermove",
      "click",
    ];

    const triggerIdleLogout = () => {
      setIdleLogoutMessage("因閒置超過 5 分鐘，已自動登出");
      void handleLogout({ clearDraft: false });
    };

    const resetIdleTimer = () => {
      lastActivityRef.current = Date.now();
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      idleTimerRef.current = window.setTimeout(() => {
        triggerIdleLogout();
      }, idleTimeoutMs);
    };

    const handleActivity = () => resetIdleTimer();

    events.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= idleTimeoutMs) {
        triggerIdleLogout();
      } else {
        resetIdleTimer();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    const idleCheckInterval = window.setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= idleTimeoutMs) {
        triggerIdleLogout();
      }
    }, 30000);

    resetIdleTimer();

    return () => {
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      window.clearInterval(idleCheckInterval);
      events.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [isLoggedIn]);

  return {
    sessionChecked,
    isLoggedIn,
    authUsername,
    isAdmin,
    idleLogoutMessage,
    setIdleLogoutMessage,
    login,
    handleLogout,
    pauseSingleLoginValidation,
    resumeSingleLoginValidation,
  };
}
