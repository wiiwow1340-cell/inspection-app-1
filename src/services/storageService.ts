import { supabase } from "./supabaseClient";

// 將 Storage URL 轉為 signed URL（10 分鐘有效）
// 將 Storage 路徑或 URL 轉為 signed URL（10 分鐘有效）
// 支援兩種輸入：
// 1) filePath: "PT/TC1288/PT-20260102002/item1.jpg"
// 2) public URL: "https://xxx.supabase.co/storage/v1/object/public/photos/....jpg"
export async function getSignedImageUrl(input?: string): Promise<string> {
  if (!input) return "";

  try {
    let bucket = "photos";
    let path = input;

    // 情況 A：input 是完整的 public URL
    if (input.startsWith("http")) {
      const match = input.match(/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
      if (!match) return ""; // 不是我們預期的 Storage public URL，直接當作不可用
      bucket = match[1];
      path = match[2];
    }

    // 情況 B：input 是 filePath（不含 http），bucket 預設 photos
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 10); // 10 分鐘

    if (error || !data?.signedUrl) {
      console.warn("signed url 失敗", error);
      return "";
    }

    return data.signedUrl;
  } catch (e) {
    console.error("signed url 例外", e);
    return "";
  }
}

// =============================
//  共用工具函式
// =============================

// =============================
//  批次並行工具：限制同時執行數量（避免一次大量 upload）
// =============================
export async function runInBatches<T>(
  tasks: (() => Promise<T>)[],
  batchSize: number
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize).map((fn) => fn());
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
  }
  return results;
}

// 取得項目索引（1-based），確保每個項目有固定編號
function getItemIndex(procItems: string[], item: string) {
  const index = procItems.indexOf(item);
  return index >= 0 ? index + 1 : procItems.length + 1;
}

// 將圖片壓縮到最大邊 1600px，輸出 JPEG blob
async function compressImage(file: File): Promise<Blob> {
  const img = document.createElement("img");
  img.src = URL.createObjectURL(file);

  await new Promise<void>((resolve) => {
    img.onload = () => resolve();
  });

  const maxW = 1600;
  const maxH = 1600;
  let { width, height } = img;

  if (width > height && width > maxW) {
    height = (height * maxW) / width;
    width = maxW;
  } else if (height >= width && height > maxH) {
    width = (width * maxH) / height;
    height = maxH;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return file; // fallback：直接用原檔
  }
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", 0.85);
  });
}

// 上傳單張圖片到 Storage，回傳公開 URL（失敗則回傳空字串）
export async function uploadImage(
  processCode: string,
  model: string,
  serial: string,
  reportId: string,
  info: { item: string; procItems: string[]; photoIndex: number },
  file: File
): Promise<string> {
  if (!file) return "";

  const compressed = await compressImage(file);

  const { item, procItems, photoIndex } = info;
  const itemIndex = getItemIndex(procItems, item);
  const normalizedPhotoIndex = Math.max(1, photoIndex);
  const fileName = `item${itemIndex}-${normalizedPhotoIndex}.jpg`;
  const filePath = `${processCode}/${model}/${serial}/${reportId}/${fileName}`;

  try {
    const { error } = await supabase.storage
      .from("photos")
      .upload(filePath, compressed, { upsert: false });

    if (error) {
      console.error("上傳圖片失敗（Storage）:", error.message);
      return "";
    }

    return filePath;
  } catch (e: any) {
    console.error("上傳圖片失敗（例外）:", e?.message || e);
    return "";
  }
}
