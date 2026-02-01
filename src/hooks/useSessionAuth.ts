import { useEffect, useRef, useState } from "react";
import { logAuditEvent } from "../services/auditLogService";
import { supabase } from "../services/supabaseClient";

async function upsertLoginLockForCurrentUser() {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return;
  await supabase.from("user_login_lock").upsert({
    user_id: session.user.id,
    session_id: session.id,
    updated_at: new Date().toISOString(),
  });
}

async function isCurrentSessionStillValid(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return false;
  const { data: lock, error } = await supabase
    .from("user_login_lock")
    .select("session_id")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error) {
    console.error("讀取 user_login_lock 失敗：", error.message);
    return false;
  }
  if (!lock?.session_id) return false;
  return lock.session_id === session.id;
}

async function waitForSession(
  timeoutMs = 1500,
  pollIntervalMs = 100
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase.auth.getSession();
    if (data.session) return true;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
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
  const [loginLockReady, setLoginLockReady] = useState(false);

  const kickedRef = useRef(false);
  const idleTimerRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // ===== 權限判斷：Admin 白名單（可用 VITE_ADMIN_USERS 設定） =====
  // NOTE: 此處僅用於前端 UX（顯示/隱藏管理頁），不構成安全邊界。
  // 真正的寫入權限由 Supabase RLS 保護（processes 表的 INSERT/UPDATE/DELETE 為 admin-only）。
  // 前端判斷不可視為安全機制。
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
    setLoginLockReady(false);
  };

  const handleLogout = async (options?: { clearDraft?: boolean }) => {
    const clearDraft = options?.clearDraft ?? true;
    await supabase.auth.signOut();
    await onLogoutCleanup({ clearDraft });
    setIsLoggedIn(false);
    setAuthUsername("");
    setIsAdmin(false);
    setLoginLockReady(false);
  };

  const login = async (username: string, password: string) => {
    const trimmed = username.trim();
    if (!trimmed || !password) {
      return { ok: false, message: "請輸入帳號與密碼" };
    }

    const email = trimmed.includes("@")
      ? trimmed.toLowerCase()
      : `${trimmed.toLowerCase()}@local.com`;

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { ok: false, message: error.message || "登入失敗" };
    }

    const sessionReady = await waitForSession();
    if (!sessionReady) {
      await handleLogout({ clearDraft: false });
      return { ok: false, message: "登入驗證失敗，請重新登入" };
    }
    await upsertLoginLockForCurrentUser();
    const lockOk = await isCurrentSessionStillValid();
    if (!lockOk) {
      await handleLogout({ clearDraft: false });
      return { ok: false, message: "登入驗證失敗，請重新登入" };
    }
    setIdleLogoutMessage("");
    setLoginLockReady(true);
    setIsLoggedIn(true);
    void logAuditEvent({ reportId: null, action: "login" });
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
          const lockOk = await isCurrentSessionStillValid();
          if (!lockOk) {
            await handleLogout({ clearDraft: false });
            return;
          }
          if (!cancelled) {
            setLoginLockReady(true);
          }
          setIdleLogoutMessage("");
          // ⚠️ 不要讓 refreshUserRole 阻塞 sessionChecked
          refreshUserRole().catch((e) => {
            console.error("refreshUserRole 失敗：", e);
          });
        } else {
          if (!cancelled) {
            setAuthUsername("");
            setIsAdmin(false);
            setLoginLockReady(false);
          }
        }
      } catch (e) {
        console.error("initAuth 失敗：", e);
        if (!cancelled) {
          setIsLoggedIn(false);
          setAuthUsername("");
          setIsAdmin(false);
          setLoginLockReady(false);
        }
      } finally {
        window.clearTimeout(failSafe);
        if (!cancelled) setSessionChecked(true);
      }
    };

    initAuth();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSessionChecked(true);

        if (session) {
          const lockOk = await isCurrentSessionStillValid();
          if (!lockOk) {
            await handleLogout({ clearDraft: false });
            return;
          }
          setLoginLockReady(true);
          setIsLoggedIn(true);
          setIdleLogoutMessage("");
          refreshUserRole().catch((e) => {
            console.error("refreshUserRole 失敗：", e);
          });
        } else {
          setIsLoggedIn(false);
          setAuthUsername("");
          setIsAdmin(false);
          setLoginLockReady(false);
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
    if (!isLoggedIn || !loginLockReady) {
      kickedRef.current = false;
      return;
    }

    kickedRef.current = false;
    const timer = window.setInterval(async () => {
      const ok = await isCurrentSessionStillValid();
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
  };
}
