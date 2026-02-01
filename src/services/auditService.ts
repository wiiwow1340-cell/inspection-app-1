import { supabase } from "./supabaseClient";

type AuditAction =
  | "login"
  | "upload_photo_batch"
  | "report_create"
  | "report_update";

type AuditResult =
  | { ok: true }
  | { ok: false; reason: "no_session" | "insert_error" | "exception" };

export async function logAudit(
  action: AuditAction,
  reportId?: string | null,
  meta?: Record<string, unknown> | null
): Promise<AuditResult> {
  try {
    let session = (await supabase.auth.getSession()).data.session;

    if (!session) {
      const refreshed = await supabase.auth.refreshSession();
      session = refreshed.data.session ?? null;
    }

    const userId = session?.user?.id;
    if (!userId) {
      console.warn("寫入 audit_logs 失敗：沒有可用的登入 session");
      return { ok: false, reason: "no_session" };
    }

    const { error: insertError } = await supabase.from("audit_logs").insert({
      user_id: userId,
      action,
      report_id: reportId ?? null,
      meta: meta ?? null,
    });

    if (insertError) {
      console.error(
        "寫入 audit_logs 失敗：",
        insertError.message,
        insertError.code
      );
      return { ok: false, reason: "insert_error" };
    }

    return { ok: true };
  } catch (err) {
    console.error("寫入 audit_logs 例外：", err);
    return { ok: false, reason: "exception" };
  }
}
