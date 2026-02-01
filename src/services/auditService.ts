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
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError) {
      console.error("[audit] getSession failed", sessionError);
      return;
    }

    if (!sessionData.session) {
      console.error("[audit] skipped – no auth session");
      return;
    }

    const userId = sessionData.session.user?.id;
    if (!userId) {
      console.error("[audit] skipped – no auth session");
      return;
    }

    const payload = {
      ...(meta ?? {}),
      user_id: userId,
    };

    const { error: insertError } = await supabase.from("audit_logs").insert({
      user_id: userId,
      action,
      report_id: reportId ?? null,
      payload,
    });

    if (insertError) {
      console.error("[audit] insert failed", insertError);
      return;
    }
  } catch (err) {
    console.error("[audit] unexpected error", err);
  }
}
