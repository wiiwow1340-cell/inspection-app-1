import type { Report } from "../types";
import { normalizeImagesMap } from "../utils/imageUtils";
import { logAudit } from "./auditService";
import { supabase } from "./supabaseClient";

type DbWriteResult =
  | { ok: true }
  | { ok: false; message: string; code?: string };

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

  await logAudit("report_create", report.id);
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
    await logAudit("report_update", report.id);
  }

  return { error };
}
