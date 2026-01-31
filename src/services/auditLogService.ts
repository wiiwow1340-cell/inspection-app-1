import { supabase } from "./supabaseClient";

export type AuditAction =
  | "create_report"
  | "edit_report"
  | "upload_photo_batch"
  | "delete_report"
  | "delete_photo";

type AuditLogPayload = {
  reportId: string;
  action: AuditAction;
  meta?: Record<string, unknown>;
};

export async function logAuditEvent({
  reportId,
  action,
  meta,
}: AuditLogPayload): Promise<void> {
  if (!reportId) {
    console.warn("audit log skipped: missing report_id");
    return;
  }

  try {
    const payload = {
      report_id: reportId,
      action,
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
