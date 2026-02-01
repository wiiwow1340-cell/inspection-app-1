import type { Report } from "../types";
import { normalizeImagesMap } from "../utils/imageUtils";
import { supabase } from "./supabaseClient";

type DbWriteResult =
  | { ok: true; id: string }
  | { ok: false; message: string; code?: string };

// 儲存報告 JSON 至資料庫
export async function saveReportToDB(report: Report): Promise<DbWriteResult> {
  const { data, error } = await supabase
    .from("reports")
    .insert({
      ...report,
      expected_items: JSON.stringify(report.expected_items ?? []),
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    const anyErr: any = error as any;
    console.error("寫入 reports 失敗：", anyErr?.message || anyErr);
    return {
      ok: false,
      message: anyErr?.message || "reports insert failed",
      code: anyErr?.code,
    };
  }
  return { ok: true, id: data.id };
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

export async function fetchReportByIdFromDB(
  reportId: string
): Promise<Report | null> {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("id", reportId)
    .limit(1);

  if (error) {
    console.error("讀取 reports 失敗：", error.message);
    return null;
  }

  const row = data?.[0];
  if (!row) return null;

  return {
    id: row.id,
    serial: row.serial,
    model: row.model,
    process: row.process,
    edited_by: row.edited_by || "",
    images: normalizeImagesMap(row.images || {}),
    expected_items: row.expected_items ? JSON.parse(row.expected_items) : [],
  };
}

export async function updateReportInDB(report: Report) {
  const { data, error } = await supabase
    .from("reports")
    .update({
      images: report.images,
      expected_items: JSON.stringify(report.expected_items ?? []),
      edited_by: report.edited_by,
    })
    .eq("id", report.id)
    .select("id");

  if (error) {
    return { ok: false, error, updated: false };
  }

  if (!data || data.length === 0) {
    return { ok: false, error: null, updated: false };
  }

  return { ok: true, error: null, updated: true };
}
