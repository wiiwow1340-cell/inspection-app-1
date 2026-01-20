import React, { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// =============================
//  簡易 UI 元件：Button / Input / Card
// =============================

type ButtonVariant = "default" | "secondary" | "destructive";
type ButtonSize = "default" | "sm";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant | string; // 放寬型別，避免 TS 推論錯誤
  size?: ButtonSize;
}

const Button: React.FC<ButtonProps> = ({
  variant = "default",
  size = "default",
  className = "",
  ...props
}) => {
  const base =
    "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";

  const variantClass: Record<ButtonVariant, string> = {
    default:
      "bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-600",
    secondary:
      "bg-gray-100 text-gray-900 hover:bg-gray-200 focus-visible:ring-gray-400",
    destructive:
      "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600",
  };

  const sizeClass: Record<ButtonSize, string> = {
    default: "h-9 px-4 py-2",
    sm: "h-8 px-3 text-xs",
  };

  const resolvedVariant: ButtonVariant =
    variant === "secondary" || variant === "destructive"
      ? (variant as ButtonVariant)
      : "default";

  return (
    <button
      className={`${base} ${variantClass[resolvedVariant]} ${sizeClass[size]} ${className}`}
      {...props}
    />
  );
};

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input: React.FC<InputProps> = ({ className = "", ...props }) => (
  <input
    className={`flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${className}`}
    {...props}
  />
);

// =============================
//  小圖示（SVG）- 用於狀態顯示（避免字元 ✔ / ✖ 視覺大小不一致）
// =============================

type StatusIconKind = "ok" | "ng" | "na";

const StatusIcon: React.FC<{ kind: StatusIconKind; className?: string; title?: string }> = ({
  kind,
  className = "",
  title,
}) => {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (kind === "ok") {
    return (
      <svg {...common} className={className} aria-label={title} role="img">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    );
  }

  if (kind === "ng") {
    return (
      <svg {...common} className={className} aria-label={title} role="img">
        <path d="M18 6L6 18" />
        <path d="M6 6l12 12" />
      </svg>
    );
  }

  // na
  return (
    <svg {...common} className={className} aria-label={title} role="img">
      <circle cx="12" cy="12" r="9" />
      <path d="M7 17L17 7" />
    </svg>
  );
};

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

const Card: React.FC<CardProps> = ({ className = "", ...props }) => (
  <div
    className={`rounded-lg border border-gray-200 bg-white shadow-sm ${className}`}
    {...props}
  />
);

// =============================
//  型別定義
// =============================

type Process = {
  name: string;
  code: string;
  model: string;
  items: string[];
};

type Report = {
  id: string;
  serial: string;
  model: string;
  process: string;
  images: Record<string, string>; // { [itemName]: imageUrl }
  expected_items: string[]; // 報告當下應該要拍的項目清單
};

type ConfirmTarget =
  | { type: "item"; index: number }
  | { type: "process"; proc: Process }
  | null;

// 影像狀態：不適用 (N/A) 以 sentinel 存在 images map 中
const NA_SENTINEL = "__NA__";


// =============================
//  共用 UX：取消前確認（避免誤刪編輯中資料）
// =============================
function confirmDiscard(message?: string) {
  return window.confirm(
    message ||
      "目前有未儲存的編輯內容，確定要取消嗎？\n（未儲存的變更將會遺失）"
  );
}


// =============================
//  預設製程
// =============================

const DEFAULT_PROCESSES: Process[] = [
  {
    name: "性能測試",
    code: "PT",
    model: "TC1288",
    items: ["測試照片1", "測試照片2"],
  },
  {
    name: "外觀檢驗",
    code: "PR",
    model: "TC588",
    items: ["外觀正面", "外觀側面"],
  },
];

// =============================
//  Supabase 連線設定
// =============================


// =============================
//  Draft (IndexedDB) — 用於 Safari/手機「滑掉後可復原」
// =============================

type DraftPage = "home" | "reports" | "manage";

type HomeDraftData = {
  serial: string;
  selectedModel: string;
  selectedProcess: string;
  na: Record<string, boolean>;
  // item -> { blob, name, type, lastModified }
  imageFiles: Record<
    string,
    { blob: Blob; name: string; type: string; lastModified: number }
  >;
};

type ReportsDraftData = {
  selectedProcessFilter: string;
  selectedModelFilter: string;
  selectedStatusFilter: string;
  queryFilters: { process: string; model: string; status: string };
  editingReportId: string | null;
  na: Record<string, boolean>;
  editImageFiles: Record<
    string,
    { blob: Blob; name: string; type: string; lastModified: number }
  >;
};

type ManageDraftData = {
  newProcName: string;
  newProcCode: string;
  newProcModel: string;
  newItem: string;
  insertAfter: string;
  editingIndex: number | null;
  items: string[];
  editingItemIndex: number | null;
  editingItemValue: string;
};

type AppDraft =
  | { page: "home"; updatedAt: number; data: HomeDraftData }
  | { page: "reports"; updatedAt: number; data: ReportsDraftData }
  | { page: "manage"; updatedAt: number; data: ManageDraftData };

const DRAFT_DB_NAME = "inspection_app_drafts";
const DRAFT_STORE = "drafts";

function draftKey(username: string) {
  return `draft_v1:${(username || "anon").toLowerCase()}`;
}

function openDraftDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DRAFT_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDraftDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE, "readonly");
    const store = tx.objectStore(DRAFT_STORE);
    const req = store.get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function idbSet<T>(key: string, val: T): Promise<void> {
  const db = await openDraftDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE, "readwrite");
    const store = tx.objectStore(DRAFT_STORE);
    store.put(val as any, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      const err = tx.error || new Error("IndexedDB write failed");
      db.close();
      reject(err);
    };
  });
}

async function idbDel(key: string): Promise<void> {
  const db = await openDraftDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE, "readwrite");
    const store = tx.objectStore(DRAFT_STORE);
    store.delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      const err = tx.error || new Error("IndexedDB delete failed");
      db.close();
      reject(err);
    };
  });
}

function fileToDraftBlob(file: File) {
  return {
    blob: file as unknown as Blob,
    name: file.name,
    type: file.type || "application/octet-stream",
    lastModified: file.lastModified || Date.now(),
  };
}

function draftBlobToFile(d: {
  blob: Blob;
  name: string;
  type: string;
  lastModified: number;
}) {
  try {
    return new File([d.blob], d.name || "image.jpg", {
      type: d.type || "application/octet-stream",
      lastModified: d.lastModified || Date.now(),
    });
  } catch {
    // 某些舊 Safari 環境可能沒有 File constructor
    const b: any = d.blob;
    b.name = d.name || "image.jpg";
    b.lastModified = d.lastModified || Date.now();
    return b as File;
  }
}
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// =============================
//  單一登入鎖（最小版）：後登入踢前登入
//  - 每個瀏覽器/裝置會有自己的 local session id（存在 localStorage）
//  - 登入成功後把 (user_id, session_id) upsert 到 user_login_lock
//  - 已登入時每 3 秒檢查一次：DB 的 session_id 不是我 → alert + signOut + 回登入頁
// =============================
const SINGLE_LOGIN_LOCAL_KEY = "single_login_session_id";

function getOrCreateLocalLoginSessionId() {
  const existing = localStorage.getItem(SINGLE_LOGIN_LOCAL_KEY);
  if (existing) return existing;
  const sid = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(SINGLE_LOGIN_LOCAL_KEY, sid);
  return sid;
}

async function upsertLoginLockForCurrentUser() {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return;
  const sid = getOrCreateLocalLoginSessionId();
  await supabase.from("user_login_lock").upsert({
    user_id: session.user.id,
    session_id: sid,
    updated_at: new Date().toISOString(),
  });
}

async function isCurrentSessionStillValid(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return false;
  const sid = localStorage.getItem(SINGLE_LOGIN_LOCAL_KEY) || "";
  if (!sid) return true; // 沒有本機 sid 時先不擋（避免誤踢）

  const { data: lock, error } = await supabase
    .from("user_login_lock")
    .select("session_id")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error) {
    console.error("讀取 user_login_lock 失敗：", error.message);
    return true; // 讀不到就先不擋，避免全站不能用
  }
  if (!lock?.session_id) return true;
  return lock.session_id === sid;
}
// 將 Storage URL 轉為 signed URL（30 分鐘有效）
// 將 Storage 路徑或 URL 轉為 signed URL（30 分鐘有效）
// 支援兩種輸入：
// 1) filePath: "PT/TC1288/PT-20260102002/item1.jpg"
// 2) public URL: "https://xxx.supabase.co/storage/v1/object/public/photos/....jpg"
async function getSignedImageUrl(input?: string): Promise<string> {
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
      .createSignedUrl(path, 60 * 30); // 30 分鐘

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
async function runInBatches<T>(
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



// 把中文項目名轉成安全檔名 item1 / item2 / ...
function getSafeItemName(procItems: string[], item: string) {
  const index = procItems.indexOf(item);
  return index >= 0 ? `item${index + 1}` : "item";
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
async function uploadImage(
  processCode: string,
  model: string,
  serial: string,
  info: { item: string; procItems: string[] },
  file: File
): Promise<string> {
  if (!file) return "";

  const compressed = await compressImage(file);

  const { item, procItems } = info;
  const safeItem = getSafeItemName(procItems, item);
  const fileName = `${safeItem}.jpg`;
  const filePath = `${processCode}/${model}/${serial}/${fileName}`;

  try {
    const { error } = await supabase.storage
      .from("photos")
      .upload(filePath, compressed, { upsert: true });

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

// 儲存報告 JSON 至資料庫
type DbWriteResult =
  | { ok: true }
  | { ok: false; message: string; code?: string };

// 儲存報告 JSON 至資料庫
async function saveReportToDB(report: Report): Promise<DbWriteResult> {
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
  return { ok: true };
}

// 從資料庫載入所有報告
async function fetchReportsFromDB(): Promise<Report[]> {
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
    images: row.images || {},
    expected_items: row.expected_items ? JSON.parse(row.expected_items) : [],
  }));
}

// =============================
//  Login Page（帳號 + 密碼，帳號會轉成 email@local）
// =============================

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState(""); // 顯示給使用者的「帳號」
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setErr("");

    const trimmed = username.trim();
    if (!trimmed || !password) {
      setErr("請輸入帳號與密碼");
      setLoading(false);
      return;
    }

    const email = `${trimmed}@local.com`;

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErr(error.message || "登入失敗");
    } else {
      await upsertLoginLockForCurrentUser();
      onLogin();
    }

    setLoading(false);
  };

  return (
    <div className="p-4 max-w-sm mx-auto space-y-4">
      <Card className="p-4 space-y-3">
        <h2 className="text-xl font-bold">🔐 請先登入</h2>
        <div className="space-y-2">
          <label className="text-sm font-medium">帳號</label>
          <Input
            placeholder="例如：MGCQA1"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">密碼</label>
          <Input
            placeholder="輸入密碼"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {err && <p className="text-red-500 text-sm">{err}</p>}
        <Button onClick={handleLogin} disabled={loading} className="w-full">
          {loading ? "登入中..." : "登入"}
        </Button>
      </Card>
    </div>
  );
}

// =============================
//  檢驗 APP 主程式
// =============================

export default function App() {
  // ===== 登入狀態 =====
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // ===== 權限（Admin 才能管理製程）=====
  const [authUsername, setAuthUsername] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // ===== 單一登入鎖：被踢出處理 =====
  const kickedRef = useRef(false);
  const handleKickedOut = async () => {
    if (kickedRef.current) return;
    kickedRef.current = true;
    alert("此帳號已在其他裝置登入，系統將登出。");
    // 不 await，避免卡住 UI（有時 signOut 會卡在網路或 SDK 狀態）
    supabase.auth.signOut();
    setIsLoggedIn(false);
    setAuthUsername("");
    setIsAdmin(false);
  };


  // ===== 頁面與表單狀態 =====
  const [page, setPage] = useState<"home" | "reports" | "manage">("home");

  // 新增檢驗資料用
  const [serial, setSerial] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedProcess, setSelectedProcess] = useState("");
  const [images, setImages] = useState<Record<string, string>>({}); // 新增頁預覽用
  const [newImageFiles, setNewImageFiles] = useState<
    Record<string, File | undefined>
  >({}); // 新增頁實際上傳用

  // ===== Draft / 恢復提示（三頁共用）=====
  const [pendingDraft, setPendingDraft] = useState<AppDraft | null>(null);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const draftLoadedRef = useRef(false);
  const draftSaveTimerRef = useRef<number | null>(null);


  // 製程 / 報告資料
  const [processes, setProcesses] = useState<Process[]>([]);
  const [reports, setReports] = useState<Report[]>([]);

  // 查看報告：查詢後才顯示
  const [showReports, setShowReports] = useState(false);

  // 管理製程用
  const [newProcName, setNewProcName] = useState("");
  const [newProcCode, setNewProcCode] = useState("");
  const [newProcModel, setNewProcModel] = useState("");
  const [newItem, setNewItem] = useState("");
  const [insertAfter, setInsertAfter] = useState<string>("last"); // 新增項目插入位置（last 或 index）
  const [items, setItems] = useState<string[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [expandedProcessIndex, setExpandedProcessIndex] = useState<number | null>(null);

  // 管理製程：編輯「檢驗項目名稱」
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editingItemValue, setEditingItemValue] = useState<string>("");


  // 查看報告：就地編輯照片
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null); // 展開檢視用（不等於編輯）

  // 新增檢驗：N/A 標記（不刪照片，可逆）
  const [homeNA, setHomeNA] = useState<Record<string, boolean>>({});

  // 編輯報告：N/A 標記（不刪照片，可逆）
  const [editNA, setEditNA] = useState<Record<string, boolean>>({});

  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editImages, setEditImages] = useState<Record<string, string>>({});
  const [editImageFiles, setEditImageFiles] = useState<
    Record<string, File | undefined>
  >({});

  // 編輯儲存前預覽
  const [showEditPreview, setShowEditPreview] = useState(false);
  const [editPreviewIndex, setEditPreviewIndex] = useState(0);

  // 查看報告：篩選條件（UI 綁定）
  const [selectedProcessFilter, setSelectedProcessFilter] = useState("");
  const [selectedModelFilter, setSelectedModelFilter] = useState("");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("");

  // 查詢正式條件（按「查詢」後才生效）
  const [queryFilters, setQueryFilters] = useState({
    process: "",
    model: "",
    status: "",
  });

  // 刪除確認 Modal 用
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>(null);

  // 新增檢驗：儲存前預覽
  const [showPreview, setShowPreview] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [signedImg, setSignedImg] = useState<string>("");

  // ===== 防止重複儲存（新增 / 編輯）：UI state + 即時防重入 ref =====
  const [isSavingNew, setIsSavingNew] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); // 新增上傳進度狀態
  const savingNewRef = useRef(false);
  const savingEditRef = useRef(false);

useEffect(() => {
  if (!showEditPreview || !editingReportId) {
    return;
  }

  const report = reports.find((r) => r.id === editingReportId);
  if (!report) {
    setSignedImg("");
    return;
  }

  const item = report.expected_items?.[editPreviewIndex];
  if (!item) {
    setSignedImg("");
    return;
  }

  const rawImg =
  editImages[item] ||
  report.images?.[item];

  if (editNA[item] || rawImg === NA_SENTINEL) {
    setSignedImg("");
    return;
  }

if (!rawImg) {
  setSignedImg("");
  return;
}

// ✅ 新上傳的（data/blob/http）直接顯示，不要做 signed
if (
  rawImg.startsWith("data:") ||
  rawImg.startsWith("blob:") ||
  rawImg.startsWith("http://") ||
  rawImg.startsWith("https://")
) {
  setSignedImg(rawImg);
  return;
}

// ✅ 舊照片（storage path）才去轉 signed URL
(async () => {
  const signed = await getSignedImageUrl(rawImg);
  setSignedImg(signed);
})();

}, [
  showEditPreview,
  editingReportId,
  editPreviewIndex,
  reports,
  editImages,
  editNA,
]);


  // ===== 權限判斷：Admin 白名單（可用 VITE_ADMIN_USERS 設定） =====
  const computeIsAdmin = (u: string) => {
    return u === "admin";

  };

  const refreshUserRole = async () => {
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email || "";
    const u = email.includes("@") ? email.split("@")[0] : "";
    setAuthUsername(u);
    setIsAdmin(computeIsAdmin(u));
  };

  // ===== 登入狀態初始化（Supabase Session） =====
  useEffect(() => {
    let cancelled = false;

    // ✅ 保險：任何情況都不要讓畫面永久卡在 Loading
    const failSafe = window.setTimeout(() => {
      if (!cancelled) setSessionChecked(true);
    }, 4000);

    const initAuth = async () => {
      try {
        // ✅ 再加一層 timeout：避免極端情況 getSession Promise 卡住
        const sessionRes: any = await Promise.race([
          supabase.auth.getSession(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("getSession timeout")), 3000)
          ),
        ]);

        const data = sessionRes?.data;
        const error = sessionRes?.error;

        if (error) {
          console.error("getSession 失敗：", error.message || error);
        }

        const hasSession = !!data?.session;

        if (!cancelled) {
          setIsLoggedIn(hasSession);
        }

        if (hasSession) {
          // ⚠️ 不要讓 refreshUserRole 阻塞 sessionChecked
          refreshUserRole().catch((e) => {
            console.error("refreshUserRole 失敗：", e);
          });
        } else {
          if (!cancelled) {
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

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        // ✅ 狀態先更新，不要被 refreshUserRole 卡住
        setIsLoggedIn(!!session);
        setSessionChecked(true);

        if (session) {
          refreshUserRole().catch((e) => {
            console.error("refreshUserRole 失敗：", e);
          });
        } else {
          setAuthUsername("");
          setIsAdmin(false);
        }
      }
    );

    return () => {
      cancelled = true;
      window.clearTimeout(failSafe);
      listener?.subscription.unsubscribe();
    };
  }, []);

// ===== 單一登入鎖：已登入時定期檢查（後登入踢前登入） =====
  useEffect(() => {
    if (!isLoggedIn) {
      kickedRef.current = false;
      return;
    }

    kickedRef.current = false;
    const timer = window.setInterval(async () => {
      const ok = await isCurrentSessionStillValid();
      if (!ok) {
        await handleKickedOut();
      }
    }, 3000);

    return () => window.clearInterval(timer);
  }, [isLoggedIn]);


  // ===== 一進 APP：載入 processes + reports（登入後才執行） =====
  useEffect(() => {
    if (!isLoggedIn) return;

    const init = async () => {
      // 1) 先載製程
      const { data: procData, error: procErr } = await supabase
        .from("processes")
        .select("*")
        .order("id", { ascending: true });

      if (procErr) {
        console.error("讀取 processes 失敗：", procErr.message);
        setProcesses(DEFAULT_PROCESSES);
      } else if (procData && procData.length > 0) {
        setProcesses(
          procData.map((p: any) => ({
            name: p.name,
            code: p.code,
            model: p.model,
            items: p.items ? JSON.parse(p.items) : [],
          }))
        );
      } else {
        // 第一次啟動：寫入預設流程
        for (const dp of DEFAULT_PROCESSES) {
          await supabase.from("processes").insert({
            name: dp.name,
            code: dp.code,
            model: dp.model,
            items: JSON.stringify(dp.items),
          });
        }
        setProcesses(DEFAULT_PROCESSES);
      }

      // 2) 再載報告
      const data = await fetchReportsFromDB();
      setReports(data);
    };

    init();
  }, [isLoggedIn]);

  // ===== 共用計算：型號 / 製程 / 篩選後報告 =====
  const productModels = Array.from(
    new Set(processes.map((p) => p.model).filter(Boolean))
  );

  const filteredProcesses = selectedModel
    ? processes.filter((p) => p.model === selectedModel)
    : processes;

  const selectedProcObj =
    processes.find(
      (p) => p.name === selectedProcess && p.model === selectedModel
    ) || null;

  const filteredReports = reports.filter((r) => {
    if (queryFilters.process && r.process !== queryFilters.process) return false;
    if (queryFilters.model && r.model !== queryFilters.model) return false;

    const expected = r.expected_items || [];
    const isItemNA = (item: string) => r.images?.[item] === NA_SENTINEL;
    const isItemDone = (item: string) => isItemNA(item) || !!r.images?.[item];

    if (queryFilters.status === "done") {
      // 已完成：所有「非 N/A」項目都有照片（N/A 視為已完成）
      const required = expected.filter((it) => !isItemNA(it));
      if (required.length === 0) return true;
      if (!required.every((item) => !!r.images?.[item])) return false;
    }

    if (queryFilters.status === "not") {
      // 未完成：存在「非 N/A」但尚未拍照的項目
      const required = expected.filter((it) => !isItemNA(it));
      if (required.length === 0) return false;
      if (!required.some((item) => !r.images?.[item])) return false;
    }

    // 其他狀態：不過濾
    return true;
  });



  // ===== 拍照 / 上傳：新增頁（Home） =====
  const handleCapture = (item: string, file: File | undefined) => {
    if (!file) return;

    // 預覽：用 blob URL（快且不吃記憶體）
    const previewUrl = URL.createObjectURL(file);

    setImages((prev) => {
      // 釋放舊的 blob URL（避免記憶體累積）
      const old = prev[item];
      if (old && typeof old === "string" && old.startsWith("blob:")) {
        try { URL.revokeObjectURL(old); } catch { /* ignore */ }
      }
      return { ...prev, [item]: previewUrl };
    });

    setNewImageFiles((prev) => ({ ...prev, [item]: file }));
  };

  // ===== 拍照 / 上傳：報告編輯（Reports - Edit mode） =====
  const handleEditCapture = (item: string, file: File | undefined) => {
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);

    setEditImages((prev) => {
      const old = prev[item];
      if (old && typeof old === "string" && old.startsWith("blob:")) {
        try { URL.revokeObjectURL(old); } catch { /* ignore */ }
      }
      return { ...prev, [item]: previewUrl };
    });

    setEditImageFiles((prev) => ({ ...prev, [item]: file }));

    // 若這個項目之前被標 N/A，使用者重新拍照時，視為取消 N/A
    setEditNA((prev) => {
      if (!prev[item]) return prev;
      const next = { ...prev };
      delete next[item];
      return next;
    });
  };

  // ===== 新增表單：確認儲存（上傳到 Storage + 寫 DB） =====
  const saveReport = async (): Promise<boolean> => {
    const sn = serial.trim();
    if (!sn) {
      alert("請先輸入序號");
      return false;
    }
    if (!selectedModel || !selectedProcess || !selectedProcObj) {
      alert("請先選擇型號與製程");
      return false;
    }

    const expectedItems = selectedProcObj.items || [];
    const uploadedImages: Record<string, string> = {};

    // --- 新增：初始化進度 ---
    setUploadProgress(0);
    let completedCount = 0;
    const totalTasks = expectedItems.length;

    const uploadTasks = expectedItems.map((item) => async () => {
      try {
        if (homeNA[item]) {
          uploadedImages[item] = NA_SENTINEL;
          return;
        }
        const file = newImageFiles[item];
        if (!file) return;

        const path = await uploadImage(
          selectedProcObj.code,
          selectedModel,
          sn,
          { item, procItems: expectedItems },
          file
        );
        if (path) {
          uploadedImages[item] = path;
        }
      } finally {
        // --- 新增：每完成一個項目就更新進度 ---
        completedCount++;
        setUploadProgress(Math.round((completedCount / totalTasks) * 100));
      }
    });

    // 同時最多 6 張，其餘排隊
    await runInBatches(uploadTasks, 6);

    // 產生表單 ID：製程代號-YYYYMMDDNNN（同日遞增）
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const procCode = selectedProcObj.code;
    const todayCount =
      reports.filter((r) => r.id?.startsWith(`${procCode}-${ymd}`)).length + 1;
    const seq = String(todayCount).padStart(3, "0");
    const id = `${procCode}-${ymd}${seq}`;

    const report: Report = {
      id,
      serial: sn,
      model: selectedModel,
      process: selectedProcess,
      images: uploadedImages,
      expected_items: expectedItems,
    };

    const res = await saveReportToDB(report);
    if (!res.ok) {
      console.error("saveReportToDB failed:", res);
      alert(`寫入雲端失敗，請稍後再試。

(${res.message})`);
      return false;
    }

    // 寫入成功後：不做 optimistic append，改為重新從 DB 讀取（DB-only）
    alert("儲存成功");
    const freshReports = await fetchReportsFromDB();
    setReports(freshReports);
    await resetNewReportState(true);
    return true;
  };

  // ===== 查看報告：列表列點擊展開（只檢視，不等於編輯）=====
  const toggleExpandReport = (id: string) => {
    setExpandedReportId((prev) => {
      const next = prev === id ? null : id;
      // 若正在編輯同一張，收合前需確認
      if (next === null && editingReportId === id) {
        const hasDirty =
          Object.keys(editImageFiles).length > 0 ||
          Object.keys(editNA).length > 0;
        if (hasDirty && !confirmDiscard()) return prev;

        revokePreviewUrls(editImages);
        setEditingReportId(null);
        setEditImages({});
        setEditImageFiles({});
        setEditNA({});
        setShowEditPreview(false);
        setEditPreviewIndex(0);
        setSignedImg("");
      }
      return next;
    });
  };

  const beginEditReport = (id: string) => {
    const report = reports.find((rr) => rr.id === id);
    setExpandedReportId(id);
    setEditingReportId(id);
    setEditImages({});
    setEditImageFiles({});
    setShowEditPreview(false);
    setEditPreviewIndex(0);
    setSignedImg("");

    // 初始化 N/A（從既有資料帶入）
    const nextNA: Record<string, boolean> = {};
    (report?.expected_items || []).forEach((it) => {
      if (report?.images?.[it] === NA_SENTINEL) nextNA[it] = true;
    });
    setEditNA(nextNA);
  };

  const toggleEditReport = (id: string) => {
    if (editingReportId === id) {
      const hasDirty =
        Object.keys(editImageFiles).length > 0 ||
        Object.keys(editNA).length > 0;
      if (hasDirty && !confirmDiscard()) return;

      // 取消編輯：保留展開（回到檢視模式）
      revokePreviewUrls(editImages);
      setEditingReportId(null);
      setEditImages({});
      setEditImageFiles({});
      setEditNA({});
      setShowEditPreview(false);
      setEditPreviewIndex(0);
      setSignedImg("");
      setExpandedReportId(id);
      return;
    }
    beginEditReport(id);
  };




  // =============================
  //  Draft：三頁共用「滑掉可復原」(UX-1)
  // =============================

  const getDraftId = () => draftKey(authUsername || "anon");

  const revokePreviewUrls = (obj: Record<string, string>) => {
    try {
      Object.values(obj).forEach((u) => {
        if (typeof u === "string" && u.startsWith("blob:")) {
          URL.revokeObjectURL(u);
        }
      });
    } catch {
      // ignore
    }
  };

  const resetNewReportState = async (alsoClearDraft = true) => {
    revokePreviewUrls(images);
    setSerial("");
    setSelectedModel("");
    setSelectedProcess("");
    setImages({});
    setNewImageFiles({});
    setHomeNA({});
    setPreviewIndex(0);
    setShowPreview(false);
    if (alsoClearDraft) {
      try {
        await idbDel(getDraftId());
      } catch {
        // ignore
      }
    }
  };

  const resetEditState = async (alsoClearDraft = false) => {
    revokePreviewUrls(editImages);
    setEditingReportId(null);
    setEditImages({});
        setEditImageFiles({});
        setEditNA({});
    setShowEditPreview(false);
    setEditPreviewIndex(0);
    if (alsoClearDraft) {
      try {
        await idbDel(getDraftId());
      } catch {
        // ignore
      }
    }
  };

  const resetManageState = async (alsoClearDraft = false) => {
    setEditingIndex(null);
    setItems([]);
    setEditingItemIndex(null);
    setEditingItemValue("");
    setNewProcName("");
    setNewProcCode("");
    setNewProcModel("");
    setNewItem("");
    setInsertAfter("last");
    if (alsoClearDraft) {
      try {
        await idbDel(getDraftId());
      } catch {
        // ignore
      }
    }
  };

  const buildDraftFromState = (): AppDraft | null => {
    const now = Date.now();

    if (page === "home") {
      const hasAnything =
        serial.trim() ||
        selectedModel ||
        selectedProcess ||
        Object.keys(newImageFiles).length > 0 ||
        Object.keys(homeNA).length > 0;
      if (!hasAnything) return null;

      const imageFiles: HomeDraftData["imageFiles"] = {};
      Object.entries(newImageFiles).forEach(([k, f]) => {
        if (f) imageFiles[k] = fileToDraftBlob(f);
      });

      return {
        page: "home",
        updatedAt: now,
        data: {
          serial,
          selectedModel,
          selectedProcess,
          imageFiles,
          na: { ...homeNA },
        },
      };
    }

    if (page === "reports") {
      const hasAnything =
        selectedProcessFilter ||
        selectedModelFilter ||
        selectedStatusFilter ||
        queryFilters.process ||
        queryFilters.model ||
        queryFilters.status ||
        editingReportId ||
        Object.keys(editImageFiles).length > 0 ||
        Object.keys(editNA).length > 0;

      if (!hasAnything) return null;

      const editImageFilesDraft: ReportsDraftData["editImageFiles"] = {};
      Object.entries(editImageFiles).forEach(([k, f]) => {
        if (f) editImageFilesDraft[k] = fileToDraftBlob(f);
      });

      return {
        page: "reports",
        updatedAt: now,
        data: {
          selectedProcessFilter,
          selectedModelFilter,
          selectedStatusFilter,
          queryFilters: { ...queryFilters },
          editingReportId,
          editImageFiles: editImageFilesDraft,
          na: { ...editNA },
        },
      };
    }

    // manage
    const hasAnything =
      newProcName.trim() ||
      newProcCode.trim() ||
      newProcModel ||
      newItem.trim() ||
      editingIndex !== null ||
      items.length > 0 ||
      editingItemIndex !== null ||
      editingItemValue.trim();

    if (!hasAnything) return null;

    return {
      page: "manage",
      updatedAt: now,
      data: {
        newProcName,
        newProcCode,
        newProcModel,
        newItem,
        insertAfter,
        editingIndex,
        items,
        editingItemIndex,
        editingItemValue,
      },
    };
  };

  const applyDraftToState = async (draft: AppDraft) => {
    if (draft.page === "home") {
      await resetNewReportState(false);
      setPage("home");
      setSerial(draft.data.serial || "");
      setSelectedModel(draft.data.selectedModel || "");
      setSelectedProcess(draft.data.selectedProcess || "");
      setHomeNA(draft.data.na || {});

      // 還原照片檔（File）+ 預覽 blob URL
      const nextFiles: Record<string, File | undefined> = {};
      const nextPreviews: Record<string, string> = {};

      Object.entries(draft.data.imageFiles || {}).forEach(([item, fd]) => {
        const file = draftBlobToFile(fd);
        nextFiles[item] = file;
        try {
          nextPreviews[item] = URL.createObjectURL(file);
        } catch {
          // ignore
        }
      });

      setNewImageFiles(nextFiles);
      setImages(nextPreviews);
      return;
    }

    if (draft.page === "reports") {
      await resetEditState(false);
      setPage("reports");

      setSelectedProcessFilter(draft.data.selectedProcessFilter || "");
      setSelectedModelFilter(draft.data.selectedModelFilter || "");
      setSelectedStatusFilter(draft.data.selectedStatusFilter || "");
      setQueryFilters({
        process: draft.data.queryFilters?.process || "",
        model: draft.data.queryFilters?.model || "",
        status: draft.data.queryFilters?.status || "",
      });

      const nextFiles: Record<string, File | undefined> = {};
      const nextPreviews: Record<string, string> = {};
      Object.entries(draft.data.editImageFiles || {}).forEach(([item, fd]) => {
        const file = draftBlobToFile(fd);
        nextFiles[item] = file;
        try {
          nextPreviews[item] = URL.createObjectURL(file);
        } catch {
          // ignore
        }
      });

      setEditImageFiles(nextFiles);
      setEditImages(nextPreviews);
      setEditNA(draft.data.na || {});
      setEditingReportId(draft.data.editingReportId || null);
      if (draft.data.editingReportId) setExpandedReportId(draft.data.editingReportId);
      return;
    }

    // manage
    await resetManageState(false);
    setPage("manage");

    setNewProcName(draft.data.newProcName || "");
    setNewProcCode(draft.data.newProcCode || "");
    setNewProcModel(draft.data.newProcModel || "");
    setNewItem(draft.data.newItem || "");
    setInsertAfter(draft.data.insertAfter || "last");
    setEditingIndex(draft.data.editingIndex ?? null);
    setItems(draft.data.items || []);
    setEditingItemIndex(draft.data.editingItemIndex ?? null);
    setEditingItemValue(draft.data.editingItemValue || "");
  };

  const scheduleSaveDraft = (immediate = false) => {
    if (!isLoggedIn || !authUsername) return;

    const run = async () => {
      try {
        const d = buildDraftFromState();
        if (!d) {
          await idbDel(getDraftId());
          return;
        }
        await idbSet(getDraftId(), d);
      } catch {
        // ignore
      }
    };

    if (immediate) {
      void run();
      return;
    }

    if (draftSaveTimerRef.current) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }

    draftSaveTimerRef.current = window.setTimeout(() => {
      void run();
      draftSaveTimerRef.current = null;
    }, 700);
  };

  // 啟動時：讀取草稿（只做一次）
  useEffect(() => {
    if (!isLoggedIn || !authUsername) return;
    if (draftLoadedRef.current) return;
    draftLoadedRef.current = true;

    (async () => {
      try {
        const d = await idbGet(getDraftId());
        if (d) {
          setPendingDraft(d);
          setShowDraftPrompt(true);
        }
      } catch {
        // ignore
      }
    })();
  }, [isLoggedIn, authUsername]);

  // 狀態變動：自動存草稿
  useEffect(() => {
    scheduleSaveDraft(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    page,
    serial,
    selectedModel,
    selectedProcess,
    newImageFiles,
    homeNA,
    selectedProcessFilter,
    selectedModelFilter,
    selectedStatusFilter,
    queryFilters,
    editingReportId,
    editImageFiles,
    editNA,
    newProcName,
    newProcCode,
    newProcModel,
    newItem,
    insertAfter,
    editingIndex,
    items,
    editingItemIndex,
    editingItemValue,
  ]);

  // 管理製程：新增 / 移除項目
  const addItem = () => {
    const val = newItem.trim();
    if (!val) return;

    setItems((prev) => {
      const next = [...prev];

      // insertAfter: "last" 或 0..n-1（代表插在該 index 後面）
      if (insertAfter === "last" || next.length === 0) {
        next.push(val);
      } else {
        const parsed = Number(insertAfter);
        const idx = Number.isFinite(parsed) ? parsed : next.length - 1;
        const safeIdx = Math.max(0, Math.min(idx, next.length - 1));
        next.splice(safeIdx + 1, 0, val);
      }

      return next;
    });

    setNewItem("");
  };

  const moveItemUp = (index: number) => {
    if (index <= 0) return;
    setItems((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const moveItemDown = (index: number) => {
    setItems((prev) => {
      if (index < 0 || index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // 管理製程：編輯檢驗項目名稱
  const startEditingItem = (idx: number) => {
    setEditingItemIndex(idx);
    setEditingItemValue(items[idx] || "");
  };

  const cancelEditingItem = () => {
    const hasDirty = editingItemValue.trim();
    if (hasDirty && !confirmDiscard("確定要取消編輯項目嗎？")) return;
    setEditingItemIndex(null);
    setEditingItemValue("");
  };

  const saveEditingItem = () => {
    if (editingItemIndex === null) return;
    const val = editingItemValue.trim();
    if (!val) return;

    setItems((prev) => prev.map((x, i) => (i === editingItemIndex ? val : x)));

    setEditingItemIndex(null);
    setEditingItemValue("");
  };


  const addProcess = async (proc: Process) => {
    const { error } = await supabase.from("processes").insert({
      name: proc.name,
      code: proc.code,
      model: proc.model,
      items: JSON.stringify(proc.items),
    });
    if (error) {
      console.error("新增製程失敗：", error.message);
      alert("新增製程失敗，請稍後再試");
      return;
    }
    setProcesses((prev) => [...prev, proc]);
  };

  const removeProcess = async (proc: Process) => {
    const { error } = await supabase
      .from("processes")
      .delete()
      .match({ name: proc.name, code: proc.code, model: proc.model });

    if (error) {
      console.error("刪除製程失敗：", error.message);
      alert("刪除製程失敗，請稍後再試");
      return;
    }

    setProcesses((prev) => prev.filter((p) => p !== proc));
  };


  const cancelManageCreate = async () => {
    const hasDirty =
      newProcName.trim() ||
      newProcCode.trim() ||
      newProcModel.trim() ||
      newItem.trim() ||
      items.length > 0;
    if (hasDirty && !confirmDiscard("確定要取消新增製程嗎？\n（已輸入的資料將會清除）")) return;
    await resetManageState(true);
  };

  const saveProcess = async () => {
    if (!newProcName.trim() || !newProcCode.trim() || !newProcModel.trim()) {
      alert("請輸入製程名稱、代號與產品型號");
      return;
    }

    const updatedProcess: Process = {
      name: newProcName.trim(),
      code: newProcCode.trim(),
      model: newProcModel.trim(),
      items: [...items],
    };

    if (editingIndex !== null) {
      const original = processes[editingIndex];
      const { error } = await supabase
        .from("processes")
        .update({
          name: updatedProcess.name,
          code: updatedProcess.code,
          model: updatedProcess.model,
          items: JSON.stringify(updatedProcess.items),
        })
        .match({
          name: original.name,
          code: original.code,
          model: original.model,
        });

      if (error) {
        console.error("更新製程失敗：", error.message);
        alert("更新製程失敗，請稍後再試");
        return;
      }

      setProcesses((prev) => {
        const copy = [...prev];
        copy[editingIndex] = updatedProcess;
        return copy;
      });
      setEditingIndex(null);
    } else {
      await addProcess(updatedProcess);
    }

    setNewProcName("");
    setNewProcCode("");
    setNewProcModel("");
    setItems([]);
  };

  const startEditingProcess = (index: number) => {
    const proc = processes[index];
    setNewProcName(proc.name);
    setNewProcCode(proc.code);
    setNewProcModel(proc.model || "");
    setItems(proc.items || []);
    setEditingIndex(index);
  };

  // =============================
  //  登入保護：尚未檢查完 / 尚未登入
  // =============================

  if (!sessionChecked) {
    return <div className="p-4">Loading...</div>;
  }

  if (!isLoggedIn) {
    return <LoginPage onLogin={() => setIsLoggedIn(true)} />;
  }

  // =============================
  //  主 UI
  // =============================

  return (
    <div className="p-4 max-w-xl mx-auto space-y-4">
      {/* 上方主選單 + 登出 */}
      <div className="flex justify-between items-center space-x-2">
        <div className="flex space-x-2">
          <Button
            onClick={async () => {
              if (
                page === "home" &&
                (serial.trim() ||
                  selectedModel ||
                  selectedProcess ||
                  Object.keys(newImageFiles).length > 0)
              ) {
                const ok = window.confirm(
                  "目前有未完成的新增檢驗資料。\n要清除並重新開始嗎？"
                );
                if (!ok) return;
                await resetNewReportState(true);
              }
              setPage("home");
            }}
          className="h-14 px-3"
          >


            <div className="flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-2">
              
              <span className="text-xs sm:text-sm text-center sm:text-left leading-tight">
                新增檢驗資料
              </span>
            </div>


          </Button>

          <Button onClick={() => setPage("reports")} className="h-14 px-3">


            <div className="flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-2">
              
              <span className="text-xs sm:text-sm text-center sm:text-left leading-tight">
                查看報告
              </span>
            </div>


          </Button>

          <Button
            onClick={() => setPage("manage")}
            disabled={!isAdmin}
            title={!isAdmin ? "僅限管理員帳號使用" : ""}
            className="h-14 px-3"
          >


            <div className="flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-2">
              
              <span className="text-xs sm:text-sm text-center sm:text-left leading-tight">
                管理製程
              </span>
            </div>


          </Button>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await supabase.auth.signOut();
            setIsLoggedIn(false);
            setAuthUsername("");
            setIsAdmin(false);
          }}
        >
          登出
        </Button>
      </div>

      {/* 新增檢驗資料頁 */}
      {page === "home" && (
        <Card className="p-4 space-y-4">
          <h2 className="text-xl font-bold">新增檢驗資料</h2>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!serial || !selectedModel || !selectedProcess) {
                alert("請先輸入序號、選擇型號與製程");
                return;
              }
              setPreviewIndex(0);
              setShowPreview(true);
            }}
            className="space-y-4"
          >
            {/* 序號 */}
            <div className="space-y-1">
              <label className="text-sm font-medium">序號</label>
              <Input
                placeholder="輸入序號"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                className={serial ? "" : "border-red-500"}
              />
              {!serial && (
                <p className="text-red-500 text-sm">此欄位為必填</p>
              )}
            </div>

            {/* 產品型號 */}
            <div className="space-y-1">
              <label className="text-sm font-medium">產品型號</label>
              <select
                value={selectedModel}
                onChange={(e) => {
                  setSelectedModel(e.target.value);
                  setSelectedProcess("");
                  setImages({});
                  setNewImageFiles({});
    setHomeNA({});
                }}
                className={`w-full border p-2 rounded ${
                  selectedModel ? "" : "border-red-500"
                }`}
              >
                <option value="">請選擇型號</option>
                {productModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              {!selectedModel && (
                <p className="text-red-500 text-sm">此欄位為必填</p>
              )}
            </div>

            {/* 製程 */}
            <div className="space-y-1">
              <label className="text-sm font-medium">製程</label>
              <select
                value={selectedProcess}
                onChange={(e) => {
                  setSelectedProcess(e.target.value);
                  setImages({});
                  setNewImageFiles({});
    setHomeNA({});
                }}
                className={`w-full border p-2 rounded ${
                  selectedProcess ? "" : "border-red-500"
                }`}
              >
                <option value="">請選擇製程</option>
                {filteredProcesses.map((p) => (
                  <option key={`${p.name}-${p.model}`} value={p.name}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
              {!selectedProcess && (
                <p className="text-red-500 text-sm">此欄位為必填</p>
              )}
            </div>

            {/* 檢驗項目 + 拍照/上傳按鈕 */}
            {selectedProcObj && selectedProcObj.items.length > 0 && (
              <div className="space-y-2 mt-2">
                {selectedProcObj.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="flex-1">{item}</span>

                    <Button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById(
                          `capture-${idx}`
                        ) as HTMLInputElement;
                        input?.click();
                      }}
                      className="px-2 py-1"
                    >
                      拍照
                    </Button>

                    <Button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById(
                          `upload-${idx}`
                        ) as HTMLInputElement;
                        input?.click();
                      }}
                      className="px-2 py-1"
                    >
                      上傳
                    </Button>

                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      id={`capture-${idx}`}
                      onChange={(e) =>
                        handleCapture(
                          item,
                          e.target.files?.[0] || undefined
                        )
                      }
                    />

                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id={`upload-${idx}`}
                      onChange={(e) =>
                        handleCapture(
                          item,
                          e.target.files?.[0] || undefined
                        )
                      }
                    />

                    {homeNA[item] ? (
                      <button
                        type="button"
                        className="w-8 h-8 inline-flex items-center justify-center text-gray-600"
                        title="N/A（不適用）- 點一下恢復"
                        onClick={() =>
                          setHomeNA((prev) => {
                            const next = { ...prev };
                            delete next[item];
                            return next;
                          })
                        }
                      >
                        <StatusIcon kind="na" title="N/A" />
                      </button>
                    ) : images[item] ? (
                      <button
                        type="button"
                        className="w-8 h-8 inline-flex items-center justify-center text-green-600"
                        title="已拍 - 點一下設為 N/A"
                        onClick={() =>
                          setHomeNA((prev) => ({ ...prev, [item]: true }))
                        }
                      >
                        <StatusIcon kind="ok" title="已拍" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="w-8 h-8 inline-flex items-center justify-center text-gray-400"
                        title="未拍 - 點一下設為 N/A"
                        onClick={() =>
                          setHomeNA((prev) => ({ ...prev, [item]: true }))
                        }
                      >
                        <StatusIcon kind="ng" title="未拍" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <Button type="submit" className="flex-1">
                確認
              </Button>
              <Button
                type="button"
                className="flex-1"
                variant="secondary"
                onClick={async () => {
                  const ok = window.confirm("確定要取消新增嗎？\n（已輸入的資料與照片將會清除）");
                  if (!ok) return;
                  await resetNewReportState(true);
                }}
              >
                取消新增
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* 查看報告頁 */}
      {page === "reports" && (
        <Card className="p-4 space-y-4">
          <h2 className="text-xl font-bold flex items-center justify-between">
            <span>報告列表</span>
            <Button
              type="button"
              onClick={async () => {
                // 查詢時一律重新從 DB 讀取，避免前端快取殘影（DB-only）
                const freshReports = await fetchReportsFromDB();
                setReports(freshReports);
                setQueryFilters({
                  process: selectedProcessFilter,
                  model: selectedModelFilter,
                  status: selectedStatusFilter,
                });
                setShowReports(true);
              }}
            >
              查詢
            </Button>
          </h2>

          {/* 篩選條件 */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              className="border p-2 rounded w-full sm:flex-1 min-w-0"
              value={selectedProcessFilter}
              onChange={(e) => setSelectedProcessFilter(e.target.value)}
            >
              <option value="">全部製程</option>
              {Array.from(new Set(processes.map((p) => p.name))).map(
                (procName) => (
                  <option key={procName} value={procName}>
                    {procName}
                  </option>
                )
              )}
            </select>

            <select
              className="border p-2 rounded w-full sm:flex-1 min-w-0"
              value={selectedModelFilter}
              onChange={(e) => setSelectedModelFilter(e.target.value)}
            >
              <option value="">全部型號</option>
              {Array.from(new Set(processes.map((p) => p.model))).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <select
              className="border p-2 rounded w-full sm:flex-1 min-w-0"
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
            >
              <option value="">全部狀態</option>
              <option value="done">已完成</option>
              <option value="not">未完成</option>
            </select>
          </div>

          {/* 查詢後才顯示報告 */}
          {showReports && (
            <>
              {filteredReports.length === 0 && <p>尚無報告</p>}

              {filteredReports.length > 0 && (
                <>
                  {/* Mobile：改為卡片式列表，避免左右滑動 */}
                  <div className="sm:hidden space-y-3">
                    {filteredReports.map((r) => {
                      const expected = r.expected_items || [];
                      const isDone =
                        expected.length > 0 &&
                        expected.every((item) => r.images?.[item] === NA_SENTINEL || !!r.images?.[item]);
                      const isOpen = expandedReportId === r.id;

                      return (
                        <div key={r.id} className="border rounded-lg overflow-hidden">
                          {/* Header（點擊展開/收合） */}
                          <button
                            type="button"
                            className="w-full text-left p-3 bg-white"
                            onClick={() => toggleExpandReport(r.id)}
                            title="點擊展開/收合"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-semibold break-all">{r.id}</div>
                              <Button
                                size="sm"
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleEditReport(r.id);
                                }}
                                title={editingReportId === r.id ? "目前編輯中" : "編輯"}
                              >
                                {editingReportId === r.id ? "編輯中" : "編輯"}
                              </Button>
                            </div>

                            <div className="mt-2 space-y-1 text-sm text-gray-700">
                              <div className="flex items-center justify-between gap-2">
                                <div className="truncate">製程名稱：{r.process}</div>
                                {isDone ? <span className="text-sm text-green-600"><span className="hidden sm:inline text-green-600">已完成</span><span className="sm:hidden text-green-600">狀態：已完成</span></span> : <span className="text-sm text-gray-600"><span className="hidden sm:inline text-gray-600">未完成</span><span className="sm:hidden text-gray-600">狀態：未完成</span></span>}
                              </div>
                              <div className="flex items-center justify-between gap-2 text-sm text-gray-600">
                                <div className="truncate">型號：{r.model}</div>
                                <div className="truncate">序號：{r.serial}</div>
                              </div>
                              <div className="text-xs text-gray-500">{isOpen ? "▼ 已展開" : "▶ 點此展開"}</div>
                            </div>
                          </button>

                          {/* 展開內容（沿用既有 render） */}
                          {isOpen && (
                            <div className="bg-gray-50 p-3">
                              {editingReportId === r.id ? (
                                <div className="space-y-2">
                                  {(r.expected_items || []).map((item, idx) => (
                                    <div key={item} className="flex items-center gap-2">
                                      <span className="flex-1">{item}</span>

                                      <Button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const input = document.getElementById(
                                            `edit-capture-${r.id}-${idx}`
                                          ) as HTMLInputElement;
                                          input?.click();
                                        }}
                                        className="px-2 py-1"
                                      >
                                        拍照
                                      </Button>

                                      <Button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const input = document.getElementById(
                                            `edit-upload-${r.id}-${idx}`
                                          ) as HTMLInputElement;
                                          input?.click();
                                        }}
                                        className="px-2 py-1"
                                      >
                                        上傳
                                      </Button>

                                      <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        className="hidden"
                                        id={`edit-capture-${r.id}-${idx}`}
                                        onChange={(e) =>
                                          handleEditCapture(
                                            item,
                                            e.target.files?.[0] || undefined
                                          )
                                        }
                                      />

                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        id={`edit-upload-${r.id}-${idx}`}
                                        onChange={(e) =>
                                          handleEditCapture(
                                            item,
                                            e.target.files?.[0] || undefined
                                          )
                                        }
                                      />

                                      {editNA[item] ? (
                                        <button
                                          type="button"
                                          className="w-8 h-8 inline-flex items-center justify-center text-gray-600"
                                          title="N/A（不適用）- 點一下恢復"
                                          onClick={() =>
                                            setEditNA((prev) => {
                                              const next = { ...prev };
                                              delete next[item];
                                              return next;
                                            })
                                          }
                                        >
                                          <StatusIcon kind="na" title="N/A" />
                                        </button>
                                      ) : (editImages[item] || (r.images[item] && r.images[item] !== NA_SENTINEL)) ? (
                                        <button
                                          type="button"
                                          className="w-8 h-8 inline-flex items-center justify-center text-green-600"
                                          title="已拍 - 點一下設為 N/A"
                                          onClick={() =>
                                            setEditNA((prev) => ({ ...prev, [item]: true }))
                                          }
                                        >
                                          <StatusIcon kind="ok" title="已拍" />
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          className="w-8 h-8 inline-flex items-center justify-center text-gray-400"
                                          title="未拍 - 點一下設為 N/A"
                                          onClick={() =>
                                            setEditNA((prev) => ({ ...prev, [item]: true }))
                                          }
                                        >
                                          <StatusIcon kind="ng" title="未拍" />
                                        </button>
                                      )}
                                    </div>
                                  ))}

                                  <div className="flex gap-2 mt-3">
                                    <Button
                                      className="flex-1"
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSignedImg("");
                                        setEditPreviewIndex(0);
                                        setShowEditPreview(true);
                                      }}
                                    >
                                      確認
                                    </Button>

                                    <Button
                                      className="flex-1"
                                      type="button"
                                      variant="secondary"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleEditReport(r.id);
                                      }}
                                    >
                                      取消
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {(r.expected_items || []).map((item) => {
                                    const v = r.images?.[item];
                                    const isNA = v === NA_SENTINEL;
                                    const hasImg = !!v && v !== NA_SENTINEL;
                                    return (
                                      <div key={item} className="flex items-center gap-2">
                                        <span className="flex-1">{item}</span>
                                        {isNA ? (
                                          <span className="w-8 h-8 inline-flex items-center justify-center text-gray-600">
                                            <StatusIcon kind="na" title="N/A" />
                                          </span>
                                        ) : hasImg ? (
                                          <span className="w-8 h-8 inline-flex items-center justify-center text-green-600">
                                            <StatusIcon kind="ok" title="已拍" />
                                          </span>
                                        ) : (
                                          <span className="w-8 h-8 inline-flex items-center justify-center text-gray-400">
                                            <StatusIcon kind="ng" title="未拍" />
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                  <div className="text-xs text-gray-500 pt-2">
                                    ※ 此處為檢視模式；如需修改，請按上方「編輯」。
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop：保留表格 */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left py-2 px-2 whitespace-nowrap">表單編號</th>
                        <th className="text-left py-2 px-2 whitespace-nowrap">製程名稱</th>
                        <th className="text-left py-2 px-2 whitespace-nowrap">產品型號</th>
                        <th className="text-left py-2 px-2 whitespace-nowrap">序號</th>
                        <th className="text-left py-2 px-2 whitespace-nowrap">狀態</th>
                        <th className="text-left py-2 px-2 whitespace-nowrap">編輯按鈕</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredReports.map((r) => {
                        const expected = r.expected_items || [];
                        const isDone =
                          expected.length > 0 &&
                          expected.every((item) => r.images?.[item] === NA_SENTINEL || !!r.images?.[item]);

                        return (
                          <React.Fragment key={r.id}>
                            <tr
                              className="border-b hover:bg-gray-50 cursor-pointer"
                              onClick={() => toggleExpandReport(r.id)}
                              title="點擊展開/收合"
                            >
                              <td className="py-2 px-2 whitespace-nowrap">
                                {r.id}
                              </td>
                              <td className="py-2 px-2 whitespace-nowrap">
                                {r.process}
                              </td>
                              <td className="py-2 px-2 whitespace-nowrap">
                                {r.model}
                              </td>
                              <td className="py-2 px-2 whitespace-nowrap">
                                {r.serial}
                              </td>
                              <td className="py-2 px-2 whitespace-nowrap">
                                {isDone ? <span className="text-green-600"><span className="hidden sm:inline text-green-600">已完成</span><span className="sm:hidden text-green-600">狀態：已完成</span></span> : <span className="text-gray-600"><span className="hidden sm:inline text-gray-600">未完成</span><span className="sm:hidden text-gray-600">狀態：未完成</span></span>}
                              </td>
                              <td className="py-2 px-2 whitespace-nowrap">
                                <Button
                                  size="sm"
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleEditReport(r.id);
                                  }}
                                >
                                  {editingReportId === r.id ? "編輯中" : "編輯"}
                                </Button>
                              </td>
                            </tr>

                            {expandedReportId === r.id && (
                              <tr className="border-b bg-gray-50">
                                <td colSpan={6} className="p-3">
                                  {/* ===== 展開區：檢視 or 編輯 ===== */}
                                  {editingReportId === r.id ? (
                                  <div className="space-y-2">
{/* 應拍項目清單 + 拍照/上傳 */}
                                    {(r.expected_items || []).map((item, idx) => (
                                      <div key={item} className="flex items-center gap-2">
                                        <span className="flex-1">{item}</span>

                                        <Button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const input = document.getElementById(
                                              `edit-capture-${r.id}-${idx}`
                                            ) as HTMLInputElement;
                                            input?.click();
                                          }}
                                          className="px-2 py-1"
                                        >
                                          拍照
                                        </Button>

                                        <Button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const input = document.getElementById(
                                              `edit-upload-${r.id}-${idx}`
                                            ) as HTMLInputElement;
                                            input?.click();
                                          }}
                                          className="px-2 py-1"
                                        >
                                          上傳
                                        </Button>

                                        <input
                                          type="file"
                                          accept="image/*"
                                          capture="environment"
                                          className="hidden"
                                          id={`edit-capture-${r.id}-${idx}`}
                                          onChange={(e) =>
                                            handleEditCapture(
                                              item,
                                              e.target.files?.[0] || undefined
                                            )
                                          }
                                        />

                                        <input
                                          type="file"
                                          accept="image/*"
                                          className="hidden"
                                          id={`edit-upload-${r.id}-${idx}`}
                                          onChange={(e) =>
                                            handleEditCapture(
                                              item,
                                              e.target.files?.[0] || undefined
                                            )
                                          }
                                        />

                                        {editNA[item] ? (
                                          <button
                                            type="button"
                                            className="w-8 h-8 inline-flex items-center justify-center text-gray-600"
                                            title="N/A（不適用）- 點一下恢復"
                                            onClick={() =>
                                              setEditNA((prev) => {
                                                const next = { ...prev };
                                                delete next[item];
                                                return next;
                                              })
                                            }
                                          >
                                            <StatusIcon kind="na" title="N/A" />
                                          </button>
                                        ) : (editImages[item] || (r.images[item] && r.images[item] !== NA_SENTINEL)) ? (
                                          <button
                                            type="button"
                                            className="w-8 h-8 inline-flex items-center justify-center text-green-600"
                                            title="已拍 - 點一下設為 N/A"
                                            onClick={() =>
                                              setEditNA((prev) => ({ ...prev, [item]: true }))
                                            }
                                          >
                                            <StatusIcon kind="ok" title="已拍" />
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            className="w-8 h-8 inline-flex items-center justify-center text-gray-400"
                                            title="未拍 - 點一下設為 N/A"
                                            onClick={() =>
                                              setEditNA((prev) => ({ ...prev, [item]: true }))
                                            }
                                          >
                                            <StatusIcon kind="ng" title="未拍" />
                                          </button>
                                        )}
                                      </div>
                                    ))}

                                    <div className="flex gap-2 mt-3">
                                      <Button
                                        className="flex-1"
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSignedImg("");
                                          setEditPreviewIndex(0);
                                          setShowEditPreview(true);
                                        }}
                                      >
                                        確認
                                      </Button>

                                      <Button
                                        className="flex-1"
                                        type="button"
                                        variant="secondary"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          // 收合 + 清除編輯暫存
                                          toggleEditReport(r.id);
                                        }}
                                      >
                                        取消
                                      </Button>
                                    </div>
                                  </div>
                                  ) : (
                                    <div className="space-y-2">
                                      {(r.expected_items || []).map((item) => {
                                        const v = r.images?.[item];
                                        const isNA = v === NA_SENTINEL;
                                        const hasImg = !!v && v !== NA_SENTINEL;
                                        return (
                                          <div key={item} className="flex items-center gap-2">
                                            <span className="flex-1">{item}</span>
                                            {isNA ? (
                                              <span className="w-8 h-8 inline-flex items-center justify-center text-gray-600">
                                                <StatusIcon kind="na" title="N/A" />
                                              </span>
                                            ) : hasImg ? (
                                              <span className="w-8 h-8 inline-flex items-center justify-center text-green-600">
                                                <StatusIcon kind="ok" title="已拍" />
                                              </span>
                                            ) : (
                                              <span className="w-8 h-8 inline-flex items-center justify-center text-gray-400">
                                                <StatusIcon kind="ng" title="未拍" />
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                      <div className="text-xs text-gray-500 pt-2">
                                        ※ 此處為檢視模式；如需修改，請按右側「編輯」。
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </Card>
      )}

      {/* 管理製程頁 */}
      {page === "manage" && (
        !isAdmin ? (
          <Card className="p-4 space-y-3">
          <h2 className="text-xl font-bold">管理製程</h2>
          <p className="text-red-600">此頁僅限管理員帳號使用。</p>
          <p className="text-sm text-gray-600">目前登入：{authUsername || "未知"}</p>
        </Card>
        ) : (
        <Card className="p-4 space-y-4">
          <h2 className="text-xl font-bold">管理製程</h2>

          <div className="space-y-4">
            {/* 製程基本資料輸入 */}
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Input
                  value={newProcName}
                  placeholder="製程名稱"
                  onChange={(e) => setNewProcName(e.target.value)}
                />
                <Input
                  value={newProcCode}
                  placeholder="製程代號"
                  onChange={(e) => setNewProcCode(e.target.value)}
                />
              </div>
              <Input
                value={newProcModel}
                placeholder="產品型號"
                onChange={(e) => setNewProcModel(e.target.value)}
              />
              {editingIndex !== null && (
                <div className="text-xs text-gray-500">
                  ※ 目前為「編輯製程」模式，修改後請按「更新製程」
                </div>
              )}
            </div>

            {/* 檢驗照片項目新增區（支援插入位置） */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={newItem}
                  placeholder="新增檢驗照片項目"
                  onChange={(e) => setNewItem(e.target.value)}
                />
                <Button type="button" onClick={addItem}>
                  加入
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 whitespace-nowrap">
                  插入在
                </span>
                <select
                  value={insertAfter}
                  onChange={(e) => setInsertAfter(e.target.value)}
                  className="border p-2 rounded flex-1 h-9"
                >
                  <option value="last">最後</option>
                  {items.map((it, idx) => (
                    <option key={`${it}-${idx}`} value={String(idx)}>
                      在「{it}」後
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 項目列表（可刪除） */}
            {items.map((i, idx) => (
              <div
                key={idx}
                className="border p-2 rounded flex justify-between items-center"
              >
                {editingItemIndex === idx ? (
                  <div className="flex-1 flex gap-2 items-center">
                    <Input
                      value={editingItemValue}
                      onChange={(e) => setEditingItemValue(e.target.value)}
                      className="h-9"
                    />
                    <Button type="button" size="sm" onClick={saveEditingItem}>
                      儲存
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={cancelEditingItem}
                    >
                      取消
                    </Button>
                  </div>
                ) : (
                  <span className="flex-1">{i}</span>
                )}

                <div className="flex gap-2">
                  {editingItemIndex === idx ? null : (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => startEditingItem(idx)}
                      title="編輯名稱"
                    >
                      編輯
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => moveItemUp(idx)}
                    disabled={idx === 0}
                    title="上移"
                  >
                    ↑
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => moveItemDown(idx)}
                    disabled={idx === items.length - 1}
                    title="下移"
                  >
                    ↓
                  </Button>

                  <Button
                    variant="destructive"
                    size="sm"
                    type="button"
                    onClick={() => setConfirmTarget({ type: "item", index: idx })}
                  >
                    刪除
                  </Button>
                </div>
              </div>
            ))}

            {/* 儲存 / 更新製程 */}
            <div className="flex gap-2">
              <Button onClick={saveProcess} className="flex-1" type="button">
                {editingIndex !== null ? "更新製程" : "儲存製程"}
              </Button>

              {editingIndex === null ? (
                <Button
                  className="flex-1"
                  type="button"
                  variant="secondary"
                  onClick={cancelManageCreate}
                >
                  取消新增
                </Button>
              ) : (
                <Button
                  className="flex-1"
                  type="button"
                  variant="secondary"
                  onClick={async () => {
                    if (!confirmDiscard("確定要取消編輯製程嗎？")) return;
                    await resetManageState(false);
                  }}
                >
                  取消編輯
                </Button>
              )}
            </div>

            {/* 已有製程列表（表格 + 可展開） */}
            <div className="border rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-left">
                    <th className="p-2 w-10"></th>
                    <th className="p-2">製程名稱</th>
                    <th className="p-2">製程代號</th>
                    <th className="p-2">產品型號</th>
                    <th className="p-2 w-32">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {processes.map((p, idx) => {
                    const isOpen = expandedProcessIndex === idx;
                    return (
                      <React.Fragment key={`${p.name}-${p.code}-${p.model}-${idx}`}>
                        <tr
                          className="border-t hover:bg-gray-50 cursor-pointer"
                          onClick={() =>
                            setExpandedProcessIndex((prev) => (prev === idx ? null : idx))
                          }
                        >
                          <td className="p-2">{isOpen ? "▼" : "▶"}</td>
                          <td className="p-2">{p.name}</td>
                          <td className="p-2">{p.code}</td>
                          <td className="p-2">{p.model || "—"}</td>
                          <td className="p-2" onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-2">
                              <Button type="button" size="sm" onClick={() => startEditingProcess(idx)}>
                                編輯
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => setConfirmTarget({ type: "process", proc: p })}
                              >
                                刪除
                              </Button>
                            </div>
                          </td>
                        </tr>

                        {isOpen && (
                          <tr className="border-t">
                            <td className="p-0" colSpan={5}>
                              <div className="p-3 bg-gray-50">
                                <div className="font-semibold mb-2">檢驗項目</div>
                                {p.items.length > 0 ? (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {p.items.map((item, iidx) => (
                                      <div
                                        key={iidx}
                                        className="bg-white border rounded px-3 py-2"
                                      >
                                        {item}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-gray-500">尚未建立檢驗項目</div>
                                )}
                                <div className="text-xs text-gray-500 mt-2">
                                  ※ 若要修改此製程內容，請按上方「編輯」並於上方區塊更新後按「更新製程」
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
        )
      )}

      
      {/* 草稿恢復（UX-1） */}
      {showDraftPrompt && pendingDraft && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded shadow max-w-sm w-full">
            <p className="text-lg font-bold">偵測到未完成的作業</p>
            <p className="text-sm text-gray-600 mt-2">
              來源：
              {pendingDraft.page === "home"
                ? "新增檢驗資料"
                : pendingDraft.page === "reports"
                ? "查詢/編輯報告"
                : "管理製程"}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              最後更新：{new Date(pendingDraft.updatedAt).toLocaleString()}
            </p>

            <div className="flex gap-2 mt-4">
              <Button
                className="flex-1"
                onClick={async () => {
                  try {
                    await idbDel(getDraftId());
                  } catch {
                    // ignore
                  }
                  setPendingDraft(null);
                  setShowDraftPrompt(false);
                }}
              >
                丟棄
              </Button>
              <Button
                className="flex-1"
                onClick={async () => {
                  const d = pendingDraft;
                  setShowDraftPrompt(false);
                  setPendingDraft(null);
                  if (d) {
                    await applyDraftToState(d);
                  }
                }}
              >
                繼續
              </Button>
            </div>
          </div>
        </div>
      )}

{/* 新增儲存前預覽 Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded shadow max-w-sm w-full max-h-[90vh] flex flex-col">
            <div className="space-y-4 overflow-y-auto flex-1 pr-1">
            <p className="text-lg font-bold">📷 照片預覽</p>
            <p className="text-sm text-gray-600">
              可左右切換照片（依檢驗項目順序顯示）
            </p>

            {(() => {
              const itemsList = selectedProcObj?.items || [];
              if (itemsList.length === 0) {
                return (
                  <p className="text-sm text-gray-500">目前沒有檢驗項目</p>
                );
              }

              const safeIndex = Math.min(previewIndex, itemsList.length - 1);
              const currentItem = itemsList[safeIndex];
              const currentImg = currentItem ? images[currentItem] : null;
              const isNA = currentItem ? !!homeNA[currentItem] : false;

              return (
                <div className="space-y-2 text-center">
                  <p className="font-medium">{currentItem}</p>

                  {homeNA[currentItem] ? (
                    <p className="text-gray-600 text-sm">N/A（不適用）</p>
                  ) : currentImg ? (
                    <img src={currentImg} className="w-full max-h-[50vh] object-contain rounded border" />
                  ) : (
                    <p className="text-red-500 text-sm">尚未拍攝</p>
                  )}

                  <div className="flex justify-between pt-2">
                    <Button
                      type="button"
                      onClick={() =>
                        setPreviewIndex((prev) =>
                          prev - 1 < 0 ? itemsList.length - 1 : prev - 1
                        )
                      }
                    >
                      ⬅ 上一張
                    </Button>

                    <Button
                      type="button"
                      onClick={() =>
                        setPreviewIndex((prev) =>
                          (prev + 1) % itemsList.length
                        )
                      }
                    >
                      下一張 ➡
                    </Button>
                  </div>

                  <p className="text-xs text-gray-500">
                    {safeIndex + 1} / {itemsList.length}
                  </p>
                </div>
              );
            })()}

            </div>

            {/* --- 這是替換後的內容，請確保包含最後的兩個 </div> --- */}
            <div className="pt-3 mt-3 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
              
              {/* ✨ 進度條顯示區 */}
              {isSavingNew && (
                <div className="mb-3 px-1">
                  <div className="flex justify-between text-[10px] font-bold text-blue-600 mb-1">
                    <span>圖片上傳中...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden border border-gray-200">
                    <div 
                      className="bg-blue-600 h-full transition-all duration-300 ease-out" 
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  variant="secondary"
                  onClick={() => setShowPreview(false)}
                  disabled={isSavingNew}
                >
                  返回修改
                </Button>
                <Button
                  className="flex-1"
                  disabled={isSavingNew}
                  onClick={async () => {
                    if (savingNewRef.current) return;
                    savingNewRef.current = true;
                    setIsSavingNew(true);
                    try {
                      const ok = await saveReport();
                      if (ok) setShowPreview(false);
                    } finally {
                      savingNewRef.current = false;
                      setIsSavingNew(false);
                      setUploadProgress(0);
                    }
                  }}
                >
                  {isSavingNew ? `儲存中 ${uploadProgress}%` : "確認儲存"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 編輯儲存前預覽 Modal */}
      {showEditPreview && editingReportId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded shadow max-w-sm w-full max-h-[90vh] flex flex-col">
            <div className="space-y-4 overflow-y-auto flex-1 pr-1">
            <p className="text-lg font-bold">📷 編輯照片預覽</p>
            {(() => {
              const report = reports.find((rr) => rr.id === editingReportId);
              const itemsList = report?.expected_items || [];
              if (!report || itemsList.length === 0) {
                return (
                  <p className="text-sm text-gray-500">沒有可預覽的項目</p>
                );
              }
              const safeIndex = Math.min(editPreviewIndex, itemsList.length - 1);
              const item = itemsList[safeIndex];
          
              return (
                <div className="space-y-2 text-center">
                  <p className="font-medium">{item}</p>
                  {editNA[item] ? (
  <p className="text-gray-600 text-sm">N/A（不適用）</p>
) : signedImg ? (
  <img src={signedImg} className="w-full max-h-[50vh] object-contain rounded border" />
) : (
  <p className="text-red-500">尚未拍攝</p>
)}



                  <div className="flex justify-between pt-2">
                    <Button
                      type="button"
                      onClick={() =>
                        setEditPreviewIndex((p) =>
                          p - 1 < 0 ? itemsList.length - 1 : p - 1
                        )
                      }
                    >
                      ⬅ 上一張
                    </Button>
                    <Button
                      type="button"
                      onClick={() =>
                        setEditPreviewIndex((p) =>
                          (p + 1) % itemsList.length
                        )
                      }
                    >
                      下一張 ➡
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500">
                    {safeIndex + 1} / {itemsList.length}
                  </p>
                </div>
              );
            })()}
            </div>
            {isSavingEdit && (
              <div className="text-sm text-gray-600 text-center py-2">
                📤 上傳中… {uploadProgress}%
              </div>
            )}
            <div className="flex gap-2 pt-3 mt-3 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
              <Button
                className="flex-1"
                variant="secondary"
                onClick={() => setShowEditPreview(false)}
                disabled={isSavingEdit}
              >
                返回修改
              </Button>
              <Button
                className="flex-1"
                disabled={isSavingEdit}
                onClick={async () => {
                  // 防止連點：React 尚未 re-render 前，用 ref 先擋
                  if (savingEditRef.current) return;
                  savingEditRef.current = true;
                  setIsSavingEdit(true);

                  try {
                  const report = reports.find((rr) => rr.id === editingReportId);
                  if (!report) {
                    setShowEditPreview(false);
                    setEditingReportId(null);
                    return;
                  }

                  const expectedItems = report.expected_items || [];
                  const uploadedImages: Record<string, string> = {
                    ...report.images,
                  };

                  setUploadProgress(0);
                  let completedCount = 0;
                  const totalTasks = expectedItems.length;
                  
                  const uploadTasks = expectedItems.map((item) => async () => {
                    try {
                      if (editNA[item]) {
                        uploadedImages[item] = NA_SENTINEL;
                        return;
                      }
                  
                      const file = editImageFiles[item];
                      if (!file) {
                        if (report.images?.[item] === NA_SENTINEL) {
                          delete uploadedImages[item];
                        }
                        return;
                      }
                  
                      const url = await uploadImage(
                        processes.find((p) => p.name === report.process)?.code ||
                          report.process,
                        report.model,
                        report.serial,
                        { item, procItems: expectedItems },
                        file
                      );
                  
                      if (url) {
                        uploadedImages[item] = url;
                      }
                    } finally {
                      completedCount++;
                      setUploadProgress(
                        Math.round((completedCount / totalTasks) * 100)
                      );
                    }
                  });
                  
                  await runInBatches(uploadTasks, 6);

                  // N/A：寫入 sentinel；若從 N/A 切回一般且未重新拍照，則保留原圖（若原本是 N/A 則變回未拍）
                  expectedItems.forEach((it) => {
                    if (editNA[it]) {
                      uploadedImages[it] = NA_SENTINEL;
                      return;
                    }
                    // 若原本是 N/A，且現在已取消 N/A 但沒有新圖，視為未拍
                    if (uploadedImages[it] === NA_SENTINEL) {
                      delete uploadedImages[it];
                    }
                  });

                  const updated: Report = {
                    ...report,
                    images: uploadedImages,
                    expected_items: expectedItems,
                  };

                  const { error: updateErr } = await supabase
                    .from("reports")
                    .update({
                      images: updated.images,
                      expected_items: JSON.stringify(
                        updated.expected_items ?? []
                      ),
                    })
                    .eq("id", updated.id);

                  if (updateErr) {
                    console.error("更新 reports 失敗：", updateErr.message);
                    alert(
                      "更新雲端失敗，請稍後再試。\n\n（為避免資料不一致，本次變更未寫入雲端）"
                    );
                    return;
                  }

                  // 更新成功後再更新前端
                  setReports((prev) =>
                    prev.map((rr) => (rr.id === updated.id ? updated : rr))
                  );

                  setShowEditPreview(false);
                  setEditingReportId(null);
                  } finally {
                    savingEditRef.current = false;
                    setIsSavingEdit(false);
                  }
                }}
              >
                {isSavingEdit ? "儲存中…" : "確認儲存"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 刪除確認 Modal */}
      {confirmTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded shadow w-72 space-y-4">
            <p className="text-lg font-bold">⚠ 確定要刪除？</p>
            <p className="text-sm text-gray-600">此動作無法復原。</p>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                variant="secondary"
                onClick={() => setConfirmTarget(null)}
              >
                取消
              </Button>
              <Button
                className="flex-1"
                variant="destructive"
                onClick={async () => {
                  if (confirmTarget?.type === "item") {
                    removeItem(confirmTarget.index);
                  }
                  if (confirmTarget?.type === "process") {
                    await removeProcess(confirmTarget.proc);
                  }
                  setConfirmTarget(null);
                }}
              >
                刪除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
