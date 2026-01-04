import React, { useEffect, useRef, useState } from "react";
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

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);
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
//  單一登入鎖（作法 A）
//  - 後登入者會覆蓋 session_id
//  - 前登入者在下次檢查時會被登出
// =============================
async function upsertLoginLock() {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return;

  await supabase.from("user_login_lock").upsert({
    user_id: session.user.id,
    session_id: session.access_token,
    updated_at: new Date().toISOString(),
  });
}

async function checkLoginLock(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return true;

  const { data: lock, error } = await supabase
    .from("user_login_lock")
    .select("session_id")
    .single();

  // 若表還沒建立資料/讀取失敗：保守放行，但在 console 提醒
  if (error) {
    console.warn("讀取 user_login_lock 失敗：", error.message);
    return true;
  }
  if (!lock?.session_id) return true;

  if (lock.session_id !== session.access_token) return false;

  return true;
}

// =============================
//  共用工具函式
// =============================

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
async function saveReportToDB(report: Report): Promise<boolean> {
  const { error } = await supabase.from("reports").insert({
    ...report,
    expected_items: JSON.stringify(report.expected_items ?? []),
  });

  if (error) {
    console.error("寫入 reports 失敗：", error.message);
    return false;
  }
  return true;
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
      await upsertLoginLock();
          kickedRef.current = false;
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


  // ===== 單一登入鎖：被踢出時只提醒一次 =====
  const kickedRef = useRef(false);

  const handleKickedOut = async () => {
    if (kickedRef.current) return;
    kickedRef.current = true;
    alert("此帳號已在其他裝置登入，系統將登出");
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // ignore
    }
    setIsLoggedIn(false);
    setAuthUsername("");
    setIsAdmin(false);
    setPage("home");
  };

  const ensureSingleSession = async (): Promise<boolean> => {
    const ok = await checkLoginLock();
        if (!ok) {
          await handleKickedOut();
    return true;
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

  // 管理製程：編輯「檢驗項目名稱」
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editingItemValue, setEditingItemValue] = useState<string>("");


  // 查看報告：就地編輯照片
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
    const initAuth = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          const ok = await checkLoginLock();
          if (!ok) {
            await handleKickedOut();
            return;
          }
          setIsLoggedIn(true);
          await refreshUserRole();
        }
      } catch (e) {
        console.error("initAuth 失敗：", e);
      } finally {
        setSessionChecked(true);
      }
    };

    initAuth();

    const { data: listener } = supabase.auth.onAuthStateChange(
  async (event, session) => {
    if (!session) {
      setIsLoggedIn(false);
      setAuthUsername("");
      setIsAdmin(false);
      return;
    }

    // 重要：SIGNED_IN 當下要先寫入鎖，讓「後登入者」成為唯一有效 session
    if (event === "SIGNED_IN") {
      await upsertLoginLock();
      kickedRef.current = false;
      setIsLoggedIn(true);
      await refreshUserRole();
      return;
    }

    // 其他狀態（例如切回頁面、token refresh 等）才檢查是否被踢
    const ok = await checkLoginLock();
    if (!ok) {
      await handleKickedOut();
      return;
    }

    kickedRef.current = false;
    setIsLoggedIn(true);
    await refreshUserRole();
  }
);

return () => {

      listener?.subscription.unsubscribe();
    };
  }, []);


  // ===== 單一登入鎖：定時檢查（讓被踢者就算不操作也會被登出） =====
  useEffect(() => {
    if (!isLoggedIn) return;
    const t = window.setInterval(() => {
      // 不阻塞 UI
      ensureSingleSession();
    }, 3000);
    return () => window.clearInterval(t);
  }, [isLoggedIn]);

  // ===== 一進 APP：載入 processes + reports（登入後才執行） =====
  useEffect(() => {
    if (!isLoggedIn) return;

    const init = async () => {
      if (!(await ensureSingleSession())) return;
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

    if (queryFilters.status === "done") {
      if (!expected.every((item) => r.images[item])) return false;
    }

    if (queryFilters.status === "not") {
      if (!expected.some((item) => !r.images[item])) return false;
    }

    return true;
  });

  // ===== 工具：產生表單編號 PT-YYYYMMDDXXX =====
  const genFormId = (procName: string) => {
    const prefix = processes.find((p) => p.name === procName)?.code || "XX";
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const num = (reports.length + 1).toString().padStart(3, "0");
    return `${prefix}-${date}${num}`;
  };

  // =============================
  //  新增報告：整合 Supabase
  // =============================

  const saveReport = async () => {
    if (!serial || !selectedModel || !selectedProcess) {
      alert("請先輸入序號、選擇型號與製程");
      return;
    }

    const id = genFormId(selectedProcess);
    const proc = processes.find(
      (p) => p.name === selectedProcess && p.model === selectedModel
    );
    const processCode = proc?.code || selectedProcess;

    const expectedItems = proc?.items ?? [];
    let uploadedImages: Record<string, string> = {};

    if (proc) {
      const uploads = expectedItems.map(async (item) => {
        const file = newImageFiles[item];
        if (!file) return { item, url: "" };

        const url = await uploadImage(
          processCode,
          selectedModel,
          serial,
          { item, procItems: expectedItems },
          file
        );
        return { item, url };
      });

      const results = await Promise.all(uploads);
      results.forEach(({ item, url }) => {
        if (url) uploadedImages[item] = url;
      });
    }

    const newReport: Report = {
      id,
      serial,
      model: selectedModel,
      process: selectedProcess,
      images: uploadedImages,
      expected_items: expectedItems,
    };

    // 先更新前端
    setReports((prev) => [...prev, newReport]);

    // 再寫入 Supabase
    const ok = await saveReportToDB(newReport);
        if (!ok) {
          await handleKickedOut();

    // 清空表單
    setSerial("");
    setSelectedModel("");
    setSelectedProcess("");
    setImages({});
    setNewImageFiles({});
    setPreviewIndex(0);

    alert(`已建立報告：${id}`);
  };

  // 新增檢驗：拍照 / 上傳（預覽 + 記錄 File）
  const handleCapture = (item: string, file: File | undefined) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const previewUrl = reader.result as string;
      setImages((prev) => ({ ...prev, [item]: previewUrl }));
    };
    reader.readAsDataURL(file);

    setNewImageFiles((prev) => ({ ...prev, [item]: file }));
  };

  // 編輯報告：拍照 / 上傳（本機預覽 + 記錄 File）
const handleEditCapture = (item: string, file: File | undefined) => {
  if (!file) return;

  // 1) 用 blob URL 做預覽（穩、快、不會受 base64/reader 影響）
  const previewUrl = URL.createObjectURL(file);
  setEditImages((prev) => ({ ...prev, [item]: previewUrl }));

  // 2) 把檔案記起來，等你按「確認儲存」時才真的上傳到 Supabase
  setEditImageFiles((prev) => ({ ...prev, [item]: file }));
};


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
          <Button onClick={() => setPage("home")}>➕ 新增檢驗資料</Button>
          <Button onClick={() => setPage("reports")}>📑 查看報告</Button>
          <Button onClick={() => setPage("manage")} disabled={!isAdmin} title={!isAdmin ? "僅限管理員帳號使用" : ""}>⚙️ 管理製程</Button>
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
                      📷 拍照
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
                      📁 上傳
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

                    {images[item] ? (
                      <span className="text-green-600 font-bold text-xl">
                        ✔
                      </span>
                    ) : (
                      <span className="text-gray-400 font-bold text-xl">
                        ✘
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <Button type="submit" className="w-full mt-4">
              儲存
            </Button>
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
              onClick={() => {
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
          <div className="flex gap-2">
            <select
              className="border p-2 rounded flex-1"
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
              className="border p-2 rounded flex-1"
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
              className="border p-2 rounded flex-1"
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

              {filteredReports.map((r) => (
                <Card key={r.id} className="p-2 border space-y-2">
                  {editingReportId === r.id ? (
                    // ================= 編輯模式 =================
                    <>
                      <p className="font-bold">編輯：{r.id}</p>
                      <p>序號：{r.serial}</p>
                      <p>產品型號：{r.model}</p>
                      <p>製程：{r.process}</p>

                      {/* 應拍項目清單 + 拍照/上傳 */}
                      {(() => {
                        const allItems = r.expected_items || [];
                        return allItems.map((item, idx) => (
                          <div key={item} className="flex items-center gap-2">
                            <span className="flex-1">{item}</span>

                            <Button
                              type="button"
                              onClick={() => {
                                const input = document.getElementById(
                                  `edit-capture-${r.id}-${idx}`
                                ) as HTMLInputElement;
                                input?.click();
                              }}
                              className="px-2 py-1"
                            >
                              📷 拍照
                            </Button>

                            <Button
                              type="button"
                              onClick={() => {
                                const input = document.getElementById(
                                  `edit-upload-${r.id}-${idx}`
                                ) as HTMLInputElement;
                                input?.click();
                              }}
                              className="px-2 py-1"
                            >
                              📁 上傳
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

                            {editImages[item] || r.images[item] ? (
                              <span className="text-green-600 font-bold text-xl">
                                ✔
                              </span>
                            ) : (
                              <span className="text-gray-400 font-bold text-xl">
                                ✘
                              </span>
                            )}
                          </div>
                        ));
                      })()}

                      <div className="flex gap-2 mt-3">
                        <Button
                          className="flex-1"
                          type="button"
                          onClick={() => {
                            setSignedImg("");          // ✅ 先清掉上一張的 signed，避免切換時短暫顯示錯圖
                            setEditPreviewIndex(0);
                            setShowEditPreview(true);
                          }}

                        >
                          儲存
                        </Button>

                        <Button
                          className="flex-1"
                          type="button"
                          variant="secondary"
                          onClick={() => {
                          setEditingReportId(null);
                          setEditImages({});
                         setEditImageFiles({});
                              }}

                        >
                          取消
                        </Button>
                      </div>
                    </>
                  ) : (
                    // ================= 檢視模式 =================
                    <>
                      <p>表單編號：{r.id}</p>
                      <p>序號：{r.serial}</p>
                      <p>產品型號：{r.model}</p>
                      <p>製程：{r.process}</p>

                      {(() => {
                        const allItems = r.expected_items || [];
                        return allItems.map((item) => (
                          <div key={item} className="flex items-center gap-2">
                            <span>{item}</span>
                            {r.images[item] ? (
                              <span className="text-green-600 font-bold text-xl">
                                ✔
                              </span>
                            ) : (
                              <span className="text-gray-400 font-bold text-xl">
                                ✘
                              </span>
                            )}
                          </div>
                        ));
                      })()}

                      <Button
                        className="mt-2"
                        type="button"
                        onClick={() => {
                          setEditingReportId(r.id);
                          setEditImages({}); 
                          setEditImageFiles({});
                        }}
                      >
                        編輯
                      </Button>
                    </>
                  )}
                </Card>
              ))}
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
                  readOnly={editingIndex !== null}
                  className={editingIndex !== null ? "bg-gray-100" : ""}
                  onChange={(e) => setNewProcName(e.target.value)}
                />
                <Input
                  value={newProcCode}
                  placeholder="製程代號"
                  readOnly={editingIndex !== null}
                  className={editingIndex !== null ? "bg-gray-100" : ""}
                  onChange={(e) => setNewProcCode(e.target.value)}
                />
              </div>
              <Input
                value={newProcModel}
                placeholder="產品型號"
                readOnly={editingIndex !== null}
                className={editingIndex !== null ? "bg-gray-100" : ""}
                onChange={(e) => setNewProcModel(e.target.value)}
              />
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
              {editingIndex !== null && (
                <Button
                  className="flex-1"
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setEditingIndex(null);
                    setNewProcName("");
                    setNewProcCode("");
                    setNewProcModel("");
                    setItems([]);
                  }}
                >
                  取消編輯
                </Button>
              )}
            </div>

            {/* 已有製程列表 */}
            {processes.map((p, idx) => (
              <div key={idx} className="border p-2 rounded space-y-1">
                <div className="flex justify-between items-center">
                  <span>{`${p.name} (${p.code}) - ${p.model || "無型號"}`}</span>
                  <div className="flex gap-2">
                    <Button type="button" onClick={() => startEditingProcess(idx)}>
                      編輯
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() =>
                        setConfirmTarget({ type: "process", proc: p })
                      }
                    >
                      刪除
                    </Button>
                  </div>
                </div>
                {p.items.length > 0 && (
                  <div className="ml-4 space-y-1">
                    {p.items.map((item, iidx) => (
                      <div key={iidx} className="text-sm">
                        • {item}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
        )
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

              return (
                <div className="space-y-2 text-center">
                  <p className="font-medium">{currentItem}</p>

                  {currentImg ? (
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

            <div className="flex gap-2 pt-3 mt-3 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
              <Button
                className="flex-1"
                variant="secondary"
                onClick={() => setShowPreview(false)}
              >
                返回修改
              </Button>
              <Button
                className="flex-1"
                onClick={async () => {
                  setShowPreview(false);
                  await saveReport();
                }}
              >
                確認儲存
              </Button>
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
                  {signedImg ? (
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
            <div className="flex gap-2 pt-3 mt-3 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
              <Button
                className="flex-1"
                variant="secondary"
                onClick={() => setShowEditPreview(false)}
              >
                返回修改
              </Button>
              <Button
                className="flex-1"
                onClick={async () => {
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

                  const uploads = expectedItems.map(async (item) => {
                    const file = editImageFiles[item];
                    if (!file) return;

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
                  });

                  await Promise.all(uploads);

                  const updated: Report = {
                    ...report,
                    images: uploadedImages,
                    expected_items: expectedItems,
                  };

                  setReports((prev) =>
                    prev.map((rr) => (rr.id === updated.id ? updated : rr))
                  );

                  await supabase
                    .from("reports")
                    .update({
                      images: updated.images,
                      expected_items: JSON.stringify(
                        updated.expected_items ?? []
                      ),
                    })
                    .eq("id", updated.id);

                  setShowEditPreview(false);
                  setEditingReportId(null);
                }}
              >
                確認儲存
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