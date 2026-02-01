import type { Report } from "../types";
import { normalizeImagesMap } from "../utils/imageUtils";
import { supabase } from "./supabaseClient";

type DbWriteResult =
  | { ok: true }
  | { ok: false; message: string; code?: string };

async function logReportAudit(action: "report.create" | "report.update", reportId: string) {
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
    report_id: reportId,
  });

  if (insertError) {
    console.error("寫入 audit_logs 失敗：", insertError.message);
  }
}

// 儲存報告 JSON 至資料庫
export async function saveReportToDB(report: Report): Promise<DbWriteResult> {
  const { error } = await supabase.from("reports").insert({
    ...report,
    expected_items: JSON.stringify(report.expected_items ?? []),
  });

  if (error) {
    const anyErr: any = error as any;
    console.error("寫入 reports 失敗：", anyErr?.message || anyErr);
    return {
      ok: false,
      message: anyErr?.message || "unknown error",
      code: anyErr?.code,
    };
  }

  await logReportAudit("report.create", report.id);
  return { ok: true };
}

// 從資料庫載入所有報告
export async function fetchReportsFromDB(): Promise<Report[]> {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("讀取 reports 失敗：", error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    serial: row.serial,
    model: row.model,
    process: row.process,
    edited_by: row.edited_by || "",
    images: normalizeImagesMap(row.images || {}),
    expected_items: row.expected_items ? JSON.parse(row.expected_items) : [],
  }));
}

export async function updateReportInDB(report: Report) {
  const { error } = await supabase
    .from("reports")
    .update({
      images: report.images,
      expected_items: JSON.stringify(report.expected_items ?? []),
      edited_by: report.edited_by,
    })
    .eq("id", report.id);

  if (!error) {
    await logReportAudit("report.update", report.id);
  }

  return { error };
}
