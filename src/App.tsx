import React, { useState, useEffect, useMemo, useRef } from "react";
import HomePage from "./HomePage";
import ReportPage from "./ReportPage";
import ManagePage from "./ManagePage";
import type { Process, Report } from "./types";
import { useSessionAuth } from "./hooks/useSessionAuth";
import { useDrafts } from "./hooks/useDrafts";
import { logAudit } from "./services/auditService";
import { fetchReportsFromDB, saveReportToDB, updateReportInDB } from "./services/reportService";
import { getSignedImageUrl, runInBatches, uploadImage } from "./services/storageService";
import { supabase } from "./services/supabaseClient";
import {
  NA_SENTINEL,
  type ImageValue,
  isNAValue,
  normalizeImageValue,
  normalizeImagesMap,
} from "./utils/imageUtils";

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
      "bg-slate-100 text-slate-700 hover:bg-slate-200 focus-visible:ring-slate-400",
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
    className={`flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 shadow-sm placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${className}`}
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
    className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}
    {...props}
  />
);

type ConfirmTarget =
  | { type: "item"; index: number }
  | { type: "process"; proc: Process }
  | null;


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

// =============================
//  Login Page（帳號 + 密碼，帳號會轉成 email@local）
// =============================

function LoginPage({
  onLogin,
  idleLogoutMessage,
}: {
  onLogin: (username: string, password: string) => Promise<{
    ok: boolean;
    message?: string;
  }>;
  idleLogoutMessage: string;
}) {
  const [username, setUsername] = useState(""); // 顯示給使用者的「帳號」
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setErr("");

    const result = await onLogin(username, password);
    if (!result.ok) {
      setErr(result.message || "登入失敗");
    }

    setLoading(false);
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900 text-slate-100 flex items-center justify-center px-4 py-12 overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22240%22%20height=%22240%22%20viewBox=%220%200%20240%20240%22%3E%3Cfilter%20id=%22noise%22%3E%3CfeTurbulence%20type=%22fractalNoise%22%20baseFrequency=%220.9%22%20numOctaves=%222%22%20stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect%20width=%22240%22%20height=%22240%22%20filter=%22url(%23noise)%22%20opacity=%220.4%22/%3E%3C/svg%3E')] opacity-[0.05]"
      />
      <div className="w-full max-w-md space-y-8 -translate-y-24 sm:-translate-y-24">
        <div className="space-y-3 text-center">
          <img
            src="/logo.png"
            alt="Inspection APP Logo"
            className="mx-auto h-12 w-auto sm:h-16"
          />
          <p className="text-xs uppercase tracking-[0.35em] text-slate-300">
            INSPECTION APP
          </p>
          <h1 className="text-3xl font-semibold text-white">檢驗作業系統</h1>
          <p className="text-sm text-slate-200">
            使用公司帳號登入以進行檢驗與報告管理
          </p>
        </div>
        <Card className="rounded-2xl border border-white/30 bg-white/15 p-6 space-y-4 shadow-2xl shadow-slate-900/40 backdrop-blur-2xl">
          {idleLogoutMessage && (
            <div className="rounded-lg border border-amber-200/40 bg-amber-100/20 px-3 py-2 text-sm text-amber-100">
              {idleLogoutMessage}
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-100">帳號</label>
            <Input
              placeholder="輸入帳號"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-white text-[#111827] placeholder:text-slate-500"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-100">密碼</label>
            <Input
              placeholder="輸入密碼"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-white text-[#111827] placeholder:text-slate-500"
            />
          </div>
          {err && <p className="text-red-500 text-sm">{err}</p>}
          <Button
            onClick={handleLogin}
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500"
          >
            {loading ? "登入中..." : "登入"}
          </Button>
        </Card>
      </div>
    </div>
  );
}

// =============================
//  檢驗 APP 主程式
// =============================

export default function App() {
  const draftCleanupRef = useRef({
    clearDraft: async () => {},
    clearPrompt: () => {},
    resetTracking: () => {},
  });

  // ===== 頁面與表單狀態 =====
  const [page, setPage] = useState<"home" | "reports" | "manage">("home");

  // 新增檢驗資料用
  const [serial, setSerial] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedProcess, setSelectedProcess] = useState("");
  const [images, setImages] = useState<Record<string, string[]>>({}); // 新增頁預覽用
  const [newImageFiles, setNewImageFiles] = useState<
    Record<string, File[]>
  >({}); // 新增頁實際上傳用

  // 製程 / 報告資料
  const [processes, setProcesses] = useState<Process[]>([]);
  const [processStatus, setProcessStatus] = useState<
    "idle" | "loading" | "ready" | "empty" | "error"
  >("idle");
  const [processError, setProcessError] = useState("");
  const [reports, setReports] = useState<Report[]>([]);

  // 管理製程用
  const [newProcName, setNewProcName] = useState("");
  const [newProcCode, setNewProcCode] = useState("");
  const [newProcModel, setNewProcModel] = useState("");
  const [newItem, setNewItem] = useState("");
  const [insertAfter, setInsertAfter] = useState<string>("last"); // 新增項目插入位置（last 或 index）
  const [items, setItems] = useState<string[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [expandedProcessIndex, setExpandedProcessIndex] = useState<number | null>(null);


  // 查看報告：就地編輯照片
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null); // 展開檢視用（不等於編輯）

  // 新增檢驗：N/A 標記（不刪照片，可逆）
  const [homeNA, setHomeNA] = useState<Record<string, boolean>>({});

  // 編輯報告：N/A 標記（不刪照片，可逆）
  const [editNA, setEditNA] = useState<Record<string, boolean>>({});

  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editImages, setEditImages] = useState<Record<string, string[]>>({});
  const [editImageFiles, setEditImageFiles] = useState<Record<string, File[]>>(
    {}
  );
  const [editSignedUrlMap, setEditSignedUrlMap] = useState<
    Record<string, string[]>
  >({});
  const fetchedEditSignedReportIdRef = useRef<string | null>(null);

  // 編輯儲存前預覽
  const [showEditPreview, setShowEditPreview] = useState(false);
  const [editPreviewIndex, setEditPreviewIndex] = useState(0);

  // 查看報告：篩選條件（UI 綁定）
  const [selectedProcessFilter, setSelectedProcessFilter] = useState("");
  const [selectedModelFilter, setSelectedModelFilter] = useState("");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("");
  const [reportHasQueried, setReportHasQueried] = useState(false);
  const [pcSelectedKey, setPcSelectedKey] = useState<string | null>(null);

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

  // ===== 防止重複儲存（新增 / 編輯）：UI state + 即時防重入 ref =====
  const [isSavingNew, setIsSavingNew] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); // 新增上傳進度狀態
  const [uploadDoneCount, setUploadDoneCount] = useState(0);
  const [uploadTotalCount, setUploadTotalCount] = useState(0);
  const savingNewRef = useRef(false);
  const savingEditRef = useRef(false);

useEffect(() => {
  let isActive = true;

  if (!editingReportId) {
    fetchedEditSignedReportIdRef.current = null;
    setEditSignedUrlMap({});
    return;
  }

  if (fetchedEditSignedReportIdRef.current === editingReportId) {
    return;
  }

  const report = reports.find((r) => r.id === editingReportId);
  if (!report) {
    return;
  }

  const items = report.expected_items ?? [];

  (async () => {
    const entries = await Promise.all(
      items.map(async (item) => {
        const existingImages = normalizeImageValue(report.images?.[item]);
        if (existingImages.length === 0) {
          return [item, []] as const;
        }

        const resolved = await Promise.all(
          existingImages.map(async (raw) => {
            if (
              raw.startsWith("data:") ||
              raw.startsWith("blob:") ||
              raw.startsWith("http://") ||
              raw.startsWith("https://")
            ) {
              return raw;
            }
            return getSignedImageUrl(raw);
          })
        );
        return [item, resolved.filter(Boolean)] as const;
      })
    );

    if (!isActive) {
      return;
    }

    const nextMap: Record<string, string[]> = {};
    for (const [item, urls] of entries) {
      nextMap[item] = urls;
    }
    setEditSignedUrlMap(nextMap);
    fetchedEditSignedReportIdRef.current = editingReportId;
  })();

  return () => {
    isActive = false;
  };
}, [editingReportId, reports]);

const editPreviewImages = useMemo(() => {
  if (!showEditPreview || !editingReportId) {
    return [];
  }

  const report = reports.find((r) => r.id === editingReportId);
  if (!report) {
    return [];
  }

  const item = report.expected_items?.[editPreviewIndex];
  if (!item) {
    return [];
  }

  if (editNA[item] || isNAValue(report.images?.[item])) {
    return [];
  }

  const existingSigned = editSignedUrlMap[item] || [];
  const newPreviews = editImages[item] || [];
  return [...existingSigned, ...newPreviews];
}, [
  showEditPreview,
  editingReportId,
  editPreviewIndex,
  reports,
  editImages,
  editNA,
  editSignedUrlMap,
]);


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

  const filteredReports = reportHasQueried
    ? reports.filter((r) => {
      if (queryFilters.process && r.process !== queryFilters.process) return false;
      if (queryFilters.model && r.model !== queryFilters.model) return false;

    const expected = r.expected_items || [];
    const isItemNA = (item: string) => isNAValue(r.images?.[item]);
    const isItemDone = (item: string) =>
      isItemNA(item) || normalizeImageValue(r.images?.[item]).length > 0;
    const hasExpectedItems = expected.length > 0;

    if (queryFilters.status === "done") {
      // 已完成：所有「非 N/A」項目都有照片（N/A 視為已完成）
      if (!hasExpectedItems) return false;
      if (!expected.every((item) => isItemDone(item))) return false;
    }

    if (queryFilters.status === "not") {
      // 未完成：存在「非 N/A」但尚未拍照的項目
      if (!hasExpectedItems) return true;
      if (!expected.some((item) => !isItemDone(item))) return false;
    }

    // 其他狀態：不過濾
    return true;
  })
    : [];



  // ===== 拍照 / 上傳：新增頁（Home） =====
  const handleCapture = (
    item: string,
    files: FileList | File[] | undefined
  ) => {
    if (!files || files.length === 0) return;

    const incoming = Array.from(files);
    const previewUrls = incoming
      .map((file) => {
        try {
          return URL.createObjectURL(file);
        } catch {
          return "";
        }
      })
      .filter(Boolean);

    setImages((prev) => {
      const next = [...(prev[item] || []), ...previewUrls];
      return { ...prev, [item]: next };
    });

    setNewImageFiles((prev) => {
      const next = [...(prev[item] || []), ...incoming];
      return { ...prev, [item]: next };
    });

    // 若這個項目之前被標 N/A，使用者重新拍照時，視為取消 N/A
    setHomeNA((prev) => {
      if (!prev[item]) return prev;
      const next = { ...prev };
      delete next[item];
      return next;
    });
  };

  // ===== 拍照 / 上傳：報告編輯（Reports - Edit mode） =====
  const handleEditCapture = (
    item: string,
    files: FileList | File[] | undefined
  ) => {
    if (!files || files.length === 0) return;

    const incoming = Array.from(files);
    const previewUrls = incoming
      .map((file) => {
        try {
          return URL.createObjectURL(file);
        } catch {
          return "";
        }
      })
      .filter(Boolean);

    setEditImages((prev) => {
      const next = [...(prev[item] || []), ...previewUrls];
      return { ...prev, [item]: next };
    });

    setEditImageFiles((prev) => {
      const next = [...(prev[item] || []), ...incoming];
      return { ...prev, [item]: next };
    });

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
    if (processStatus !== "ready") {
      const message =
        processStatus === "error"
          ? `製程載入失敗，無法建立報告。\n(${processError || "未知錯誤"})`
          : processStatus === "empty"
          ? "資料庫目前沒有任何製程，無法建立報告。"
          : "製程尚未載入完成，請稍後再試。";
      alert(message);
      return false;
    }
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
    if (expectedItems.length === 0) {
      alert("此製程尚未設定檢驗項目，無法建立檢驗紀錄");
      return false;
    }
    const photoEntries = Object.entries(newImageFiles).filter(
      ([, files]) => files.length > 0
    );
    const photoItemSet = new Set(photoEntries.map(([item]) => item));
    const uploadItems = expectedItems.filter(
      (item) => homeNA[item] || photoItemSet.has(item)
    );
    const uploadedImages: Record<string, ImageValue> = {};

    // 產生表單 ID：製程代號-YYYYMMDDNNN（同日遞增）
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const procCode = selectedProcObj.code;
    const todayCount =
      reports.filter((r) => r.id?.startsWith(`${procCode}-${ymd}`)).length + 1;
    const seq = String(todayCount).padStart(3, "0");
    const id = `${procCode}-${ymd}${seq}`;

    // --- 新增：初始化進度 ---
    setUploadProgress(0);
    let completedCount = 0;
    const totalTasks =
      photoEntries.reduce((total, [, files]) => total + files.length, 0) +
      Object.keys(homeNA).filter((item) => homeNA[item]).length;
    setUploadDoneCount(0);
    setUploadTotalCount(totalTasks);

    const failedUploads: { item: string; name: string }[] = [];
    let addedCount = 0;
    const uploadTasks = uploadItems.flatMap((item) => {
      if (homeNA[item]) {
        return [
          async () => {
            uploadedImages[item] = NA_SENTINEL;
            completedCount++;
            setUploadDoneCount(completedCount);
            setUploadProgress(
              Math.round((completedCount / Math.max(totalTasks, 1)) * 100)
            );
          },
        ];
      }

      const files = newImageFiles[item] || [];
      if (files.length === 0) return [];

      uploadedImages[item] = [];
      return files.map((file, fileIndex) => async () => {
        try {
          const path = await uploadImage(
            selectedProcObj.code,
            selectedModel,
            sn,
            id,
            { item, procItems: expectedItems, photoIndex: fileIndex + 1 },
            file
          );
          if (path) {
            (uploadedImages[item] as string[]).push(path);
            addedCount++;
          } else {
            failedUploads.push({ item, name: file.name });
          }
        } finally {
          completedCount++;
          setUploadDoneCount(completedCount);
          setUploadProgress(
            Math.round((completedCount / Math.max(totalTasks, 1)) * 100)
          );
        }
      });
    });

    // 同時最多 6 張，其餘排隊
    await runInBatches(uploadTasks, 6);
    if (failedUploads.length > 0) {
      const detail = failedUploads
        .map(({ item, name }) => `${item} (${name || "未命名"})`)
        .join("\n");
      alert(`以下照片上傳失敗，請重新嘗試：\n${detail}`);
      return false;
    }

    const report: Report = {
      id,
      serial: sn,
      model: selectedModel,
      process: selectedProcess,
      edited_by: authUsername || "",
      images: normalizeImagesMap(uploadedImages),
      expected_items: expectedItems,
    };

    const res = await saveReportToDB(report);
    if (!res.ok) {
      console.error("saveReportToDB failed:", res);
      alert(`寫入雲端失敗，請稍後再試。

(${res.message})`);
      return false;
    }
    await logAudit("upload_photo_batch", report.id, { addedCount });

    // 寫入成功後：不做 optimistic append，改為重新從 DB 讀取（DB-only）
    alert("儲存成功");
    const freshReports = await fetchReportsFromDB();
    setReports(freshReports);
    await resetNewReportState();
    await clearDraft();
    return true;
  };

  const isReportEditDirty = (reportId: string | null) => {
    if (!reportId) return false;
    if (Object.values(editImageFiles).some((files) => files.length > 0))
      return true;

    const report = reports.find((rr) => rr.id === reportId);
    if (!report) {
      return Object.keys(editNA).length > 0;
    }

    const expected = report.expected_items || [];
    const originalNA = new Set(
      expected.filter((it) => isNAValue(report.images?.[it]))
    );
    const currentNA = new Set(
      Object.keys(editNA).filter((key) => editNA[key])
    );

    if (originalNA.size !== currentNA.size) return true;
    for (const item of originalNA) {
      if (!currentNA.has(item)) return true;
    }

    return false;
  };

  // ===== 查看報告：列表列點擊展開（只檢視，不等於編輯）=====
  const toggleExpandReport = (id: string) => {
    setExpandedReportId((prev) => {
      const next = prev === id ? null : id;
      // 若正在編輯同一張，收合前需確認
      if (next === null && editingReportId === id) {
        if (isReportEditDirty(id) && !confirmDiscard()) return prev;

        revokePreviewUrls(editImages);
        setEditingReportId(null);
        setEditImages({});
        setEditImageFiles({});
        setEditNA({});
        setShowEditPreview(false);
        setEditPreviewIndex(0);
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

    // 初始化 N/A（從既有資料帶入）
    const nextNA: Record<string, boolean> = {};
    (report?.expected_items || []).forEach((it) => {
      if (isNAValue(report?.images?.[it])) nextNA[it] = true;
    });
    setEditNA(nextNA);
  };

  const toggleEditReport = (id: string) => {
    if (editingReportId === id) {
      if (isReportEditDirty(id) && !confirmDiscard()) return;

      // 取消編輯：保留展開（回到檢視模式）
      revokePreviewUrls(editImages);
      setEditingReportId(null);
      setEditImages({});
      setEditImageFiles({});
      setEditNA({});
      setShowEditPreview(false);
      setEditPreviewIndex(0);
      setExpandedReportId(id);
      return;
    }
    beginEditReport(id);
  };




  // =============================
  //  Draft：三頁共用「滑掉可復原」(UX-1)
  // =============================
  const revokePreviewUrls = (obj: Record<string, string[]>) => {
    try {
      Object.values(obj).forEach((list) => {
        list.forEach((u) => {
          if (typeof u === "string" && u.startsWith("blob:")) {
            URL.revokeObjectURL(u);
          }
        });
      });
    } catch {
      // ignore
    }
  };

  const resetNewReportState = async (alsoClearDraft = false) => {
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
      await draftCleanupRef.current.clearDraft();
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
      await draftCleanupRef.current.clearDraft();
    }
  };

  const resetManageState = async (alsoClearDraft = false) => {
    setEditingIndex(null);
    setItems([]);
    setNewProcName("");
    setNewProcCode("");
    setNewProcModel("");
    setNewItem("");
    setInsertAfter("last");
    if (alsoClearDraft) {
      await draftCleanupRef.current.clearDraft();
    }
  };

  const {
    sessionChecked,
    isLoggedIn,
    authUsername,
    isAdmin,
    idleLogoutMessage,
    login,
    handleLogout,
  } = useSessionAuth({
    onLogoutCleanup: async ({ clearDraft }) => {
      await resetNewReportState();
      await resetEditState();
      await resetManageState();
      draftCleanupRef.current.clearPrompt();
      setPage("home");
      if (clearDraft) {
        await draftCleanupRef.current.clearDraft();
      }
      draftCleanupRef.current.resetTracking();
    },
    onKickedCleanup: async () => {
      await resetNewReportState();
      await resetEditState();
      await resetManageState();
      draftCleanupRef.current.clearPrompt();
      await draftCleanupRef.current.clearDraft();
      setPage("home");
      draftCleanupRef.current.resetTracking();
    },
  });

  const {
    pendingDraft,
    showDraftPrompt,
    clearDraft,
    clearDraftPrompt,
    discardPendingDraft,
    applyPendingDraft,
    resetDraftTracking,
  } = useDrafts({
    isLoggedIn,
    authUsername,
    page,
    serial,
    selectedModel,
    selectedProcess,
    newImageFiles,
    homeNA,
    selectedProcessFilter,
    selectedModelFilter,
    selectedStatusFilter,
    reportHasQueried,
    expandedReportId,
    pcSelectedKey,
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
    setPage,
    setSerial,
    setSelectedModel,
    setSelectedProcess,
    setImages,
    setNewImageFiles,
    setHomeNA,
    setSelectedProcessFilter,
    setSelectedModelFilter,
    setSelectedStatusFilter,
    setReportHasQueried,
    setPcSelectedKey,
    setQueryFilters,
    setEditImageFiles,
    setEditImages,
    setEditNA,
    setEditingReportId,
    setExpandedReportId,
    setNewProcName,
    setNewProcCode,
    setNewProcModel,
    setNewItem,
    setInsertAfter,
    setEditingIndex,
    setItems,
    resetNewReportState,
    resetEditState,
    resetManageState,
  });

  draftCleanupRef.current = {
    clearDraft,
    clearPrompt: clearDraftPrompt,
    resetTracking: resetDraftTracking,
  };

  // ===== 一進 APP：載入 processes + reports（登入後才執行） =====
  useEffect(() => {
    if (!isLoggedIn) return;

    const init = async () => {
      // 1) 先載製程
      setProcessStatus("loading");
      setProcessError("");
      const { data: procData, error: procErr } = await supabase
        .from("processes")
        .select("*")
        .order("id", { ascending: true });

      if (procErr) {
        console.error("讀取 processes 失敗：", procErr.message);
        setProcesses([]);
        setProcessStatus("error");
        setProcessError(procErr.message);
      } else if (procData && procData.length > 0) {
        setProcesses(
          procData.map((p: any) => ({
            name: p.name,
            code: p.code,
            model: p.model,
            items: p.items ? JSON.parse(p.items) : [],
          }))
        );
        setProcessStatus("ready");
      } else {
        setProcesses([]);
        setProcessStatus("empty");
      }

      // 2) 再載報告
      const data = await fetchReportsFromDB();
      setReports(data);
    };

    init();
  }, [isLoggedIn]);

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

  const updateItemName = (index: number, nextValue: string) => {
    setItems((prev) => prev.map((item, i) => (i === index ? nextValue : item)));
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
    await resetManageState();
    await clearDraft();
  };

  const saveProcess = async () => {
    if (!newProcName.trim() || !newProcCode.trim() || !newProcModel.trim()) {
      alert("請輸入製程名稱、代號與產品型號");
      return;
    }
    if (items.filter((item) => item.trim()).length === 0) {
      alert("製程必須至少包含一個檢驗項目");
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
    return (
      <LoginPage
        idleLogoutMessage={idleLogoutMessage}
        onLogin={login}
      />
    );
  }

  // =============================
  //  主 UI
  // =============================

  const shellWidthClass =
    page === "reports" ? "max-w-xl md:max-w-6xl" : "max-w-xl";

  return (
    <div className="min-h-screen bg-slate-200/70 px-4 py-6">
      <div
        className={`p-4 w-full ${shellWidthClass} mx-auto space-y-4 bg-sky-50/90 border border-sky-100/80 rounded-2xl shadow-sm`}
      >
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
                  Object.values(newImageFiles).some((files) => files.length > 0))
              ) {
                const ok = window.confirm(
                  "目前有未完成的新增檢驗資料。\n要清除並重新開始嗎？"
                );
                if (!ok) return;
                await resetNewReportState();
                await clearDraft();
              }
              setPage("home");
            }}
          className="h-14 px-3"
          >


            <div className="flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-2">
              
              <span className="text-xs sm:text-sm text-center sm:text-left leading-tight whitespace-nowrap">
                新增檢驗資料
              </span>
            </div>


          </Button>

          <Button onClick={() => setPage("reports")} className="h-14 px-3">


            <div className="flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-2">
              
              <span className="text-xs sm:text-sm text-center sm:text-left leading-tight whitespace-nowrap">
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
              
              <span className="text-xs sm:text-sm text-center sm:text-left leading-tight whitespace-nowrap">
                管理製程
              </span>
            </div>


          </Button>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await handleLogout();
          }}
        >
          登出
        </Button>
      </div>

      {page === "home" && (
        <HomePage
          serial={serial}
          setSerial={setSerial}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          selectedProcess={selectedProcess}
          setSelectedProcess={setSelectedProcess}
          productModels={productModels}
          filteredProcesses={filteredProcesses}
          selectedProcObj={selectedProcObj}
          processStatus={processStatus}
          processError={processError}
          images={images}
          setImages={setImages}
          newImageFiles={newImageFiles}
          setNewImageFiles={setNewImageFiles}
          homeNA={homeNA}
          setHomeNA={setHomeNA}
          handleCapture={handleCapture}
          resetNewReportState={resetNewReportState}
          setPreviewIndex={setPreviewIndex}
          setShowPreview={setShowPreview}
          Card={Card}
          Button={Button}
          Input={Input}
          StatusIcon={StatusIcon}
        />
      )}

      {page === "reports" && (
        <ReportPage
          Card={Card}
          Button={Button}
          StatusIcon={StatusIcon}
          processes={processes}
          processStatus={processStatus}
          processError={processError}
          reports={reports}
          filteredReports={filteredReports}
          selectedProcessFilter={selectedProcessFilter}
          setSelectedProcessFilter={setSelectedProcessFilter}
          selectedModelFilter={selectedModelFilter}
          setSelectedModelFilter={setSelectedModelFilter}
          selectedStatusFilter={selectedStatusFilter}
          setSelectedStatusFilter={setSelectedStatusFilter}
          reportHasQueried={reportHasQueried}
          setReportHasQueried={setReportHasQueried}
          pcSelectedKey={pcSelectedKey}
          setPcSelectedKey={setPcSelectedKey}
          fetchReportsFromDB={fetchReportsFromDB}
          setReports={setReports}
          setQueryFilters={setQueryFilters}
          expandedReportId={expandedReportId}
          toggleExpandReport={toggleExpandReport}
          editingReportId={editingReportId}
          toggleEditReport={toggleEditReport}
          editImages={editImages}
          editNA={editNA}
          setEditNA={setEditNA}
          handleEditCapture={handleEditCapture}
          setEditPreviewIndex={setEditPreviewIndex}
          setShowEditPreview={setShowEditPreview}
          NA_SENTINEL={NA_SENTINEL}
        />
      )}

      {page === "manage" && (
        <ManagePage
          Card={Card}
          Button={Button}
          Input={Input}
          isAdmin={isAdmin}
          authUsername={authUsername}
      
          processes={processes}
          processStatus={processStatus}
          processError={processError}
          newProcName={newProcName}
          setNewProcName={setNewProcName}
          newProcCode={newProcCode}
          setNewProcCode={setNewProcCode}
          newProcModel={newProcModel}
          setNewProcModel={setNewProcModel}
      
          editingIndex={editingIndex}
      
          newItem={newItem}
          setNewItem={setNewItem}
          insertAfter={insertAfter}
          setInsertAfter={setInsertAfter}
          items={items}
      
          expandedProcessIndex={expandedProcessIndex}
          setExpandedProcessIndex={setExpandedProcessIndex}
      
          addItem={addItem}
          updateItemName={updateItemName}
          moveItemUp={moveItemUp}
          moveItemDown={moveItemDown}
      
          saveProcess={saveProcess}
          cancelManageCreate={cancelManageCreate}
          startEditingProcess={startEditingProcess}
          setConfirmTarget={setConfirmTarget}
          confirmDiscard={confirmDiscard}
          resetManageState={resetManageState}
        />
      )}
      
      {/* 草稿恢復（UX-1） */}
      {showDraftPrompt && pendingDraft && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded shadow max-w-sm w-full border border-slate-200">
            <p className="text-lg font-bold">偵測到未完成的作業</p>
            <p className="text-sm text-slate-600 mt-2">
              來源：
              {pendingDraft.page === "home"
                ? "新增檢驗資料"
                : pendingDraft.page === "reports"
                ? "查詢/編輯報告"
                : "管理製程"}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              最後更新：{new Date(pendingDraft.updatedAt).toLocaleString()}
            </p>

            <div className="flex gap-2 mt-4">
                <Button
                  className="flex-1"
                  onClick={discardPendingDraft}
              >
                丟棄
              </Button>
              <Button
                className="flex-1"
                onClick={applyPendingDraft}
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
          <div className="bg-white p-4 rounded shadow max-w-sm w-full max-h-[90vh] flex flex-col border border-slate-200">
            <div className="space-y-4 overflow-y-auto flex-1 pr-1">
            <p className="text-lg font-bold">📷 照片預覽</p>
            <p className="text-sm text-slate-600">
              可左右切換照片（依檢驗項目順序顯示）
            </p>

            {(() => {
              const itemsList = selectedProcObj?.items || [];
              if (itemsList.length === 0) {
                return (
                  <p className="text-sm text-slate-500">目前沒有檢驗項目</p>
                );
              }

              const safeIndex = Math.min(previewIndex, itemsList.length - 1);
              const currentItem = itemsList[safeIndex];
              const currentImgs = currentItem ? images[currentItem] || [] : [];
              const isNA = currentItem ? !!homeNA[currentItem] : false;

              return (
                <div className="space-y-2 text-center">
                  <p className="font-medium">{currentItem}</p>

                  {homeNA[currentItem] ? (
                    <p className="text-slate-600 text-sm">N/A（不適用）</p>
                  ) : currentImgs.length > 0 ? (
                    <div className="grid gap-2">
                      {currentImgs.map((img, imgIndex) => (
                        <img
                          key={`${currentItem}-${imgIndex}`}
                          src={img}
                          className="w-full max-h-[50vh] object-contain rounded border"
                        />
                      ))}
                    </div>
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

                  <p className="text-xs text-slate-500">
                    {safeIndex + 1} / {itemsList.length}
                  </p>
                </div>
              );
            })()}

            </div>

            {/* --- 這是替換後的內容，請確保包含最後的兩個 </div> --- */}
            <div className="pt-3 mt-3 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
              
              {/* ✨ 進度條顯示區 */}
              {isSavingNew && (
                <div className="mb-3 px-1">
                  <div className="flex justify-between text-[10px] font-bold text-blue-600 mb-1">
                    <span>圖片上傳中...</span>
                    <span>{uploadDoneCount}/{uploadTotalCount}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden border border-slate-200">
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
                  {isSavingNew ? `儲存中 ${uploadDoneCount}/${uploadTotalCount}` : "確認儲存"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 編輯儲存前預覽 Modal */}
      {showEditPreview && editingReportId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded shadow max-w-sm w-full max-h-[90vh] flex flex-col border border-slate-200">
            <div className="space-y-4 overflow-y-auto flex-1 pr-1">
            <p className="text-lg font-bold">📷 編輯照片預覽</p>
            {(() => {
              const report = reports.find((rr) => rr.id === editingReportId);
              const itemsList = report?.expected_items || [];
              if (!report || itemsList.length === 0) {
                return (
                  <p className="text-sm text-slate-500">沒有可預覽的項目</p>
                );
              }
              const safeIndex = Math.min(editPreviewIndex, itemsList.length - 1);
              const item = itemsList[safeIndex];
          
              return (
                <div className="space-y-2 text-center">
                  <p className="font-medium">{item}</p>
                  {editNA[item] ? (
                    <p className="text-slate-600 text-sm">N/A（不適用）</p>
                  ) : editPreviewImages.length > 0 ? (
                    <div className="grid gap-2">
                      {editPreviewImages.map((img, imgIndex) => (
                        <img
                          key={`${item}-${imgIndex}`}
                          src={img}
                          className="w-full max-h-[50vh] object-contain rounded border"
                        />
                      ))}
                    </div>
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
                  <p className="text-xs text-slate-500">
                    {safeIndex + 1} / {itemsList.length}
                  </p>
                </div>
              );
            })()}
            </div>
            {isSavingEdit && (
              <div className="mb-3 px-1">
                <div className="flex justify-between text-[10px] font-bold text-blue-600 mb-1">
                  <span>圖片上傳中...</span>
                  <span>{uploadDoneCount}/{uploadTotalCount}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden border border-slate-200">
                  <div
                    className="bg-blue-600 h-full transition-all duration-300 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-3 mt-3 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
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
                  const normalizedReportImages = normalizeImagesMap(
                    report.images
                  );
                  const uploadItems = expectedItems.filter((item) => {
                    const wasNA = isNAValue(normalizedReportImages[item]);
                    const isNA = !!editNA[item];
                    const hasNewFile =
                      (editImageFiles[item] || []).length > 0;
                    // 只計算「有變動」的項目：
                    // 1) 新拍照
                    // 2) NA 狀態有變（原本不是 NA，現在是 NA）
                    return hasNewFile || (!wasNA && isNA);
                  });
                  const uploadedImages: Record<string, ImageValue> = {};
                  const failedUploads: { item: string; name: string }[] = [];
                  expectedItems.forEach((item) => {
                    if (editNA[item]) {
                      uploadedImages[item] = NA_SENTINEL;
                      return;
                    }
                    const existing = normalizeImageValue(
                      normalizedReportImages[item]
                    );
                    if (existing.length > 0) {
                      uploadedImages[item] = [...existing];
                    }
                  });

                  setUploadProgress(0);
                  let completedCount = 0;
                  const totalTasks = uploadItems.reduce((total, item) => {
                    if (editNA[item]) return total + 1;
                    return total + (editImageFiles[item]?.length || 0);
                  }, 0);
                  setUploadDoneCount(0);
                  setUploadTotalCount(totalTasks);
                  
                  let addedCount = 0;
                  const uploadTasks = uploadItems.flatMap((item) => {
                    if (editNA[item]) {
                      return [
                        async () => {
                          uploadedImages[item] = NA_SENTINEL;
                          completedCount++;
                          setUploadDoneCount(completedCount);
                          setUploadProgress(
                            Math.round(
                              (completedCount / Math.max(totalTasks, 1)) * 100
                            )
                          );
                        },
                      ];
                    }

                    const files = editImageFiles[item] || [];
                    if (files.length === 0) return [];

                    const existing = normalizeImageValue(uploadedImages[item]);
                    const baseIndex = existing.length;
                    uploadedImages[item] = [...existing];

                    return files.map((file, fileIndex) => async () => {
                      try {
                        const url = await uploadImage(
                          processes.find((p) => p.name === report.process)
                            ?.code || report.process,
                          report.model,
                          report.serial,
                          report.id,
                          {
                            item,
                            procItems: expectedItems,
                            photoIndex: baseIndex + fileIndex + 1,
                          },
                          file
                        );

                        if (url) {
                          (uploadedImages[item] as string[]).push(url);
                          addedCount++;
                        } else {
                          failedUploads.push({ item, name: file.name });
                        }
                      } finally {
                        completedCount++;
                        setUploadDoneCount(completedCount);
                        setUploadProgress(
                          Math.round(
                            (completedCount / Math.max(totalTasks, 1)) * 100
                          )
                        );
                      }
                    });
                  });
                  
                  await runInBatches(uploadTasks, 6);
                  if (failedUploads.length > 0) {
                    const detail = failedUploads
                      .map(({ item, name }) => `${item} (${name || "未命名"})`)
                      .join("\n");
                    alert(`以下照片上傳失敗，請重新嘗試：\n${detail}`);
                    return;
                  }

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
                    images: normalizeImagesMap(uploadedImages),
                    expected_items: expectedItems,
                    edited_by: authUsername || "",
                  };

                  const { error: updateErr } = await updateReportInDB(updated);

                  if (updateErr) {
                    console.error("更新 reports 失敗：", updateErr.message);
                    alert(
                      "更新雲端失敗，請稍後再試。\n\n（為避免資料不一致，本次變更未寫入雲端）"
                    );
                    return;
                  }
                  if (addedCount > 0) {
                    await logAudit("upload_photo_batch", updated.id, {
                      addedCount,
                    });
                  }

                  // 更新成功後再更新前端
                  setReports((prev) =>
                    prev.map((rr) => (rr.id === updated.id ? updated : rr))
                  );

                  alert("儲存成功");
                  setShowEditPreview(false);
                  setEditingReportId(null);
                  } finally {
                    savingEditRef.current = false;
                    setIsSavingEdit(false);
                    setUploadProgress(0);
                  }
                }}
              >
                {isSavingEdit
                  ? `儲存中 ${uploadDoneCount}/${uploadTotalCount}`
                  : "確認儲存"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 刪除確認 Modal */}
      {confirmTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded shadow w-72 space-y-4 border border-slate-200">
            <p className="text-lg font-bold">⚠ 確定要刪除？</p>
            <p className="text-sm text-slate-600">此動作無法復原。</p>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                variant="secondary"
                onClick={() => setConfirmTarget(null)}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                size="sm"
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
    </div>
  );
}
