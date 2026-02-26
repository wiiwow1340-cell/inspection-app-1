import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

export type DraftPage = "home" | "reports" | "manage";

type HomeDraftData = {
  serial: string;
  selectedModel: string;
  selectedProcess: string;
  na: Record<string, boolean>;
  // item -> { blob, name, type, lastModified }
  imageFiles: Record<
    string,
    { blob: Blob; name: string; type: string; lastModified: number }[]
  >;
};

type ReportsDraftData = {
  selectedProcessFilter: string;
  selectedModelFilter: string;
  selectedStatusFilter: string;
  queryFilters: { process: string; model: string; status: string };
  reportHasQueried: boolean;
  expandedReportId: string | null;
  editingReportId: string | null;
  pcSelectedKey: string | null;
  na: Record<string, boolean>;
  editImageFiles: Record<
    string,
    { blob: Blob; name: string; type: string; lastModified: number }[]
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
};

export type AppDraft =
  | { page: "home"; updatedAt: number; data: HomeDraftData }
  | { page: "reports"; updatedAt: number; data: ReportsDraftData }
  | { page: "manage"; updatedAt: number; data: ManageDraftData };

const DRAFT_DB_NAME = "inspection_app_drafts";
const DRAFT_STORE = "drafts";

function draftKey(username: string) {
  return `draft_v1:${username.toLowerCase()}`;
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

type UseDraftsOptions = {
  isLoggedIn: boolean;
  authUsername: string;
  page: DraftPage;
  serial: string;
  selectedModel: string;
  selectedProcess: string;
  newImageFiles: Record<string, File[]>;
  homeNA: Record<string, boolean>;
  selectedProcessFilter: string;
  selectedModelFilter: string;
  selectedStatusFilter: string;
  reportHasQueried: boolean;
  expandedReportId: string | null;
  pcSelectedKey: string | null;
  queryFilters: { process: string; model: string; status: string };
  editingReportId: string | null;
  editImageFiles: Record<string, File[]>;
  editNA: Record<string, boolean>;
  newProcName: string;
  newProcCode: string;
  newProcModel: string;
  newItem: string;
  insertAfter: string;
  editingIndex: number | null;
  items: string[];
  setPage: Dispatch<SetStateAction<DraftPage>>;
  setSerial: Dispatch<SetStateAction<string>>;
  setSelectedModel: Dispatch<SetStateAction<string>>;
  setSelectedProcess: Dispatch<SetStateAction<string>>;
  setImages: Dispatch<SetStateAction<Record<string, string[]>>>;
  setNewImageFiles: Dispatch<SetStateAction<Record<string, File[]>>>;
  setHomeNA: Dispatch<SetStateAction<Record<string, boolean>>>;
  setSelectedProcessFilter: Dispatch<SetStateAction<string>>;
  setSelectedModelFilter: Dispatch<SetStateAction<string>>;
  setSelectedStatusFilter: Dispatch<SetStateAction<string>>;
  setReportHasQueried: Dispatch<SetStateAction<boolean>>;
  setExpandedReportId: Dispatch<SetStateAction<string | null>>;
  setPcSelectedKey: Dispatch<SetStateAction<string | null>>;
  setQueryFilters: Dispatch<
    SetStateAction<{ process: string; model: string; status: string }>
  >;
  setEditImageFiles: Dispatch<SetStateAction<Record<string, File[]>>>;
  setEditImages: Dispatch<SetStateAction<Record<string, string[]>>>;
  setEditNA: Dispatch<SetStateAction<Record<string, boolean>>>;
  setEditingReportId: Dispatch<SetStateAction<string | null>>;
  setNewProcName: Dispatch<SetStateAction<string>>;
  setNewProcCode: Dispatch<SetStateAction<string>>;
  setNewProcModel: Dispatch<SetStateAction<string>>;
  setNewItem: Dispatch<SetStateAction<string>>;
  setInsertAfter: Dispatch<SetStateAction<string>>;
  setEditingIndex: Dispatch<SetStateAction<number | null>>;
  setItems: Dispatch<SetStateAction<string[]>>;
  resetNewReportState: (alsoClearDraft?: boolean) => Promise<void>;
  resetEditState: (alsoClearDraft?: boolean) => Promise<void>;
  resetManageState: (alsoClearDraft?: boolean) => Promise<void>;
};

export function useDrafts({
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
  setExpandedReportId,
  setPcSelectedKey,
  setQueryFilters,
  setEditImageFiles,
  setEditImages,
  setEditNA,
  setEditingReportId,
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
}: UseDraftsOptions) {
  const [pendingDraft, setPendingDraft] = useState<AppDraft | null>(null);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const draftLoadedRef = useRef<string | null>(null);
  const draftSaveTimerRef = useRef<number | null>(null);

  const getDraftId = () => (authUsername ? draftKey(authUsername) : null);

  const clearDraft = async () => {
    const draftId = getDraftId();
    if (!draftId) return;
    try {
      await idbDel(draftId);
    } catch {
      // ignore
    }
  };

  const buildDraftFromState = (): AppDraft | null => {
    const now = Date.now();

    if (page === "home") {
      const hasAnything =
        serial.trim() ||
        selectedModel ||
        selectedProcess ||
        Object.values(newImageFiles).some((files) => files.length > 0) ||
        Object.keys(homeNA).length > 0;
      if (!hasAnything) return null;

      const imageFiles: HomeDraftData["imageFiles"] = {};
      Object.entries(newImageFiles).forEach(([k, f]) => {
        if (f && f.length > 0) {
          imageFiles[k] = f.map((file) => fileToDraftBlob(file));
        }
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
      // 「查詢報告」屬於瀏覽行為，不應觸發「回復工作」提示。
      // 僅在實際進入編輯或有編輯內容時才保存 reports 草稿。
      const hasAnything =
        editingReportId ||
        Object.values(editImageFiles).some((files) => files.length > 0) ||
        Object.keys(editNA).length > 0;

      if (!hasAnything) return null;

      const editImageFilesDraft: ReportsDraftData["editImageFiles"] = {};
      Object.entries(editImageFiles).forEach(([k, f]) => {
        if (f && f.length > 0) {
          editImageFilesDraft[k] = f.map((file) => fileToDraftBlob(file));
        }
      });

      return {
        page: "reports",
        updatedAt: now,
        data: {
          selectedProcessFilter,
          selectedModelFilter,
          selectedStatusFilter,
          queryFilters: { ...queryFilters },
          reportHasQueried,
          expandedReportId,
          editingReportId,
          pcSelectedKey,
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
      items.length > 0;

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
      const nextFiles: Record<string, File[]> = {};
      const nextPreviews: Record<string, string[]> = {};

      Object.entries(draft.data.imageFiles || {}).forEach(([item, fds]) => {
        const list = Array.isArray(fds) ? fds : [fds];
        const files = list.map((fd) => draftBlobToFile(fd));
        nextFiles[item] = files;
        const previews: string[] = [];
        files.forEach((file) => {
          try {
            previews.push(URL.createObjectURL(file));
          } catch {
            // ignore
          }
        });
        if (previews.length > 0) nextPreviews[item] = previews;
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
      const hasQueried =
        !!draft.data.reportHasQueried ||
        !!draft.data.queryFilters?.process ||
        !!draft.data.queryFilters?.model ||
        !!draft.data.queryFilters?.status;
      setReportHasQueried(hasQueried);
      setExpandedReportId(draft.data.expandedReportId || null);
      setPcSelectedKey(draft.data.pcSelectedKey || null);
      setQueryFilters({
        process: draft.data.queryFilters?.process || "",
        model: draft.data.queryFilters?.model || "",
        status: draft.data.queryFilters?.status || "",
      });

      const nextFiles: Record<string, File[]> = {};
      const nextPreviews: Record<string, string[]> = {};
      Object.entries(draft.data.editImageFiles || {}).forEach(([item, fds]) => {
        const list = Array.isArray(fds) ? fds : [fds];
        const files = list.map((fd) => draftBlobToFile(fd));
        nextFiles[item] = files;
        const previews: string[] = [];
        files.forEach((file) => {
          try {
            previews.push(URL.createObjectURL(file));
          } catch {
            // ignore
          }
        });
        if (previews.length > 0) nextPreviews[item] = previews;
      });

      setEditImageFiles(nextFiles);
      setEditImages(nextPreviews);
      setEditNA(draft.data.na || {});
      setEditingReportId(draft.data.editingReportId || null);
      if (draft.data.editingReportId)
        setExpandedReportId(draft.data.editingReportId);
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
  };

  const scheduleSaveDraft = (immediate = false) => {
    if (!isLoggedIn || !authUsername) return;

    const run = async () => {
      try {
        const d = buildDraftFromState();
        const draftId = getDraftId();
        if (!draftId) return;
        if (!d) {
          await idbDel(draftId);
          return;
        }
        await idbSet(draftId, d);
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

  const discardPendingDraft = async () => {
    const draftId = getDraftId();
    if (draftId) {
      try {
        await idbDel(draftId);
      } catch {
        // ignore
      }
    }
    setPendingDraft(null);
    setShowDraftPrompt(false);
  };

  const clearDraftPrompt = () => {
    setPendingDraft(null);
    setShowDraftPrompt(false);
  };

  const applyPendingDraft = async () => {
    const d = pendingDraft;
    setShowDraftPrompt(false);
    setPendingDraft(null);
    if (d) {
      await applyDraftToState(d);
    }
  };

  const resetDraftTracking = () => {
    draftLoadedRef.current = null;
  };

  // 啟動時：讀取草稿（只做一次）
  useEffect(() => {
    if (!isLoggedIn || !authUsername) return;
    if (draftLoadedRef.current === authUsername) return;
    draftLoadedRef.current = authUsername;

    (async () => {
      try {
        const draftId = getDraftId();
        if (!draftId) return;
        const d = await idbGet<AppDraft>(draftId);
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
  ]);

  return {
    pendingDraft,
    showDraftPrompt,
    setShowDraftPrompt,
    setPendingDraft,
    clearDraft,
    scheduleSaveDraft,
    clearDraftPrompt,
    discardPendingDraft,
    applyPendingDraft,
    resetDraftTracking,
  };
}
