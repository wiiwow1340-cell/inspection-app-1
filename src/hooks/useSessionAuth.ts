import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

interface UseSessionAuthOptions {
  onKickedOut?: () => void;
}

export function useSessionAuth({ onKickedOut }: UseSessionAuthOptions = {}) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authUsername, setAuthUsername] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const pollingTimerRef = useRef<number | null>(null);
  const lastLoginAtRef = useRef<number>(0);

  // ===== helpers =====

  const stopPolling = () => {
    if (pollingTimerRef.current) {
      window.clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  };

  const handleKickedOut = async () => {
    stopPolling();
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    setAuthUsername("");
    setIsAdmin(false);
    onKickedOut?.();
  };

  const upsertLoginLockForCurrentUser = async (): Promise<boolean> => {
    const session = (await supabase.auth.getSession()).data.session;
    if (!session?.user?.id) return false;

    const sid = session.access_token;
    sessionIdRef.current = sid;

    const { error } = await supabase
      .from("user_login_lock")
      .upsert(
        {
          user_id: session.user.id,
          session_id: sid,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) {
      console.error("寫入 user_login_lock 失敗：", error);
      return false;
    }

    return true;
  };

  const refreshUserRole = async () => {
    const session = (await supabase.auth.getSession()).data.session;
    if (!session?.user?.id) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("role, username")
      .eq("id", session.user.id)
      .single();

    if (error) throw error;

    setAuthUsername(data?.username || "");
    setIsAdmin(data?.role === "admin");
  };

  // ===== single login validation =====

  const resumeSingleLoginValidation = () => {
    stopPolling();

    pollingTimerRef.current = window.setInterval(async () => {
      try {
        // 登入後 8 秒內不檢查（避免 replica lag 造成 B 自殺）
        if (Date.now() - lastLoginAtRef.current < 8000) return;

        const session = (await supabase.auth.getSession()).data.session;
        if (!session?.user?.id || !sessionIdRef.current) return;

        const { data, error } = await supabase
          .from("user_login_lock")
          .select("session_id, updated_at")
          .eq("user_id", session.user.id)
          .single();

        if (error) {
          console.error("讀取 user_login_lock 失敗：", error);
          return;
        }

        if (!data?.session_id) return;

        // 如果 DB 還是舊 session，而且 updated_at 比登入時間早 → 補寫一次，不踢人
        if (
          data.session_id !== sessionIdRef.current &&
          data.updated_at &&
          new Date(data.updated_at).getTime() < lastLoginAtRef.current
        ) {
          console.warn("偵測到 stale login_lock，嘗試補寫");
          await upsertLoginLockForCurrentUser();
          return;
        }

        // 真正被別台登入
        if (data.session_id !== sessionIdRef.current) {
          console.warn("此帳號已在其他裝置登入，執行踢出");
          await handleKickedOut();
        }
      } catch (e) {
        console.error("single login validation 例外：", e);
      }
    }, 3000);
  };

  // ===== init =====

  useEffect(() => {
    let cancelled = false;

    const initAuth = async () => {
      const failSafe = window.setTimeout(() => {
        if (!cancelled) setSessionChecked(true);
      }, 8000);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          lastLoginAtRef.current = Date.now();
          setIsLoggedIn(true);

          const ok = await upsertLoginLockForCurrentUser();
          if (ok) resumeSingleLoginValidation();

          await refreshUserRole();
        } else {
          if (!cancelled) {
            setIsLoggedIn(false);
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

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session) {
          lastLoginAtRef.current = Date.now();
          setIsLoggedIn(true);

          const ok = await upsertLoginLockForCurrentUser();
          if (ok) resumeSingleLoginValidation();

          refreshUserRole().catch((e) =>
            console.error("refreshUserRole 失敗：", e)
          );
        } else {
          stopPolling();
          setIsLoggedIn(false);
          setAuthUsername("");
          setIsAdmin(false);
        }
      }
    );

    return () => {
      cancelled = true;
      stopPolling();
      authListener.subscription.unsubscribe();
    };
  }, []);

  return {
    isLoggedIn,
    authUsername,
    isAdmin,
    sessionChecked,
  };
}
