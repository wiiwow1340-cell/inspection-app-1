import { supabase } from "./supabaseClient";

type AuditAction =
  | "login"
  | "upload_photo_batch"
  | "report_create"
  | "report_update";

export async function logAudit(
  action: AuditAction,
  reportId?: string | null,
  meta?: Record<string, unknown> | null
) {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.error("取得使用者失敗：", error.message);
      return;
    }
    const userId = data.user?.id;
    if (!userId) return;

    const { error: insertError } = await supabase.from("audit_logs").insert({
      user_id: userId,
      action,
      report_id: reportId ?? null,
      meta: meta ?? null,
    });

    if (insertError) {
      console.error("寫入 audit_logs 失敗：", insertError.message);
    }
  } catch (err) {
    console.error("寫入 audit_logs 例外：", err);
  }
}
