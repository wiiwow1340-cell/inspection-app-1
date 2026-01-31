import { supabase } from "./supabaseClient";

export type AuditAction =
  | "create_report"
  | "edit_report"
  | "upload_photo_batch"
  | "delete_report"
  | "delete_photo"
  | "login";

type AuditLogPayload = {
  reportId?: string | null;
  action: AuditAction;
  meta?: Record<string, unknown>;
};

export async function logAuditEvent({
  reportId,
  action,
  meta,
}: AuditLogPayload): Promise<void> {
  if (reportId === undefined) {
    console.warn("audit log skipped: missing report_id");
    return;
  }

  try {
    const { data: userData, error: userError } =
      await supabase.auth.getUser();
    if (userError) {
      console.warn("audit log skipped: failed to fetch user", userError.message);
      return;
    }
    if (!userData.user?.id) {
      console.warn("audit log skipped: missing user id");
      return;
    }
    const payload = {
      report_id: reportId ?? null,
      action,
      user_id: userData.user.id,
      ...(meta ? { meta } : {}),
    };
    const { error } = await supabase.from("audit_logs").insert(payload);
    if (error) {
      console.warn("audit log insert failed:", error.message);
    }
  } catch (err) {
    console.warn("audit log insert exception:", err);
  }
}
