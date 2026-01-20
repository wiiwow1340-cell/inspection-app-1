import React, { useState, useEffect, useRef } from "react";

interface HomePageProps {
  // 核心物件與狀態
  supabase: any;
  user: any;
  selectedModel: string;
  selectedProcObj: any;
  NA_SENTINEL: string;
  // 樣式元件與常用函式 (從 App.tsx 傳入)
  Button: any;
  Input: any;
  Card: any;
}

const HomePage: React.FC<HomePageProps> = ({
  supabase,
  user,
  selectedModel,
  selectedProcObj,
  NA_SENTINEL,
  Button,
  Input,
  Card
}) => {
  const [sn, setSn] = useState("");
  const [newImageFiles, setNewImageFiles] = useState<Record<string, File>>({});
  const [homeNA, setHomeNA] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // 1. IndexedDB 邏輯 (維持原邏輯)
  const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("InspectionDraftDB", 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains("drafts")) {
          req.result.createObjectStore("drafts", { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  };

  const loadDraft = async (pCode: string, sNumber: string) => {
    try {
      const db = await openDB();
      const tx = db.transaction("drafts", "readonly");
      const store = tx.objectStore("drafts");
      const id = `${user?.email}_${pCode}_${sNumber}`;
      const req = store.get(id);
      req.onsuccess = () => {
        if (req.result) {
          setNewImageFiles(req.result.files || {});
          setHomeNA(req.result.na || {});
        } else {
          setNewImageFiles({});
          setHomeNA({});
        }
      };
    } catch (e) { console.error("Load draft error", e); }
  };

  const saveDraftLocal = async (pCode: string, sNumber: string, files: any, na: any) => {
    try {
      const db = await openDB();
      const tx = db.transaction("drafts", "readwrite");
      const store = tx.objectStore("drafts");
      const id = `${user?.email}_${pCode}_${sNumber}`;
      store.put({ id, files, na, updatedAt: Date.now() });
    } catch (e) { console.error("Save draft error", e); }
  };

  const deleteDraftLocal = async (pCode: string, sNumber: string) => {
    try {
      const db = await openDB();
      const tx = db.transaction("drafts", "readwrite");
      tx.objectStore("drafts").delete(`${user?.email}_${pCode}_${sNumber}`);
    } catch (e) { console.error("Delete draft error", e); }
  };

  // 2. 圖片壓縮 (維持原邏輯：1600px)
  const compressImage = async (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;
          const maxSide = 1600;
          if (width > maxSide || height > maxSide) {
            if (width > height) {
              height = (maxSide / width) * height;
              width = maxSide;
            } else {
              width = (maxSide / height) * width;
              height = maxSide;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => blob ? resolve(blob) : reject("Blob error"), "image/jpeg", 0.8);
        };
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const uploadImage = async (pCode: string, model: string, sNumber: string, item: string, file: File) => {
    const compressed = await compressImage(file);
    const fileName = `${Date.now()}_${item}.jpg`;
    const filePath = `${pCode}/${model}/${sNumber}/${fileName}`;
    const { error: upErr } = await supabase.storage.from("inspection-images").upload(filePath, compressed);
    if (upErr) throw upErr;
    return filePath;
  };

  // 3. 儲存邏輯 (實作一次上傳 6 張平衡穩定性與速度)
  const saveReport = async () => {
    if (!selectedProcObj || !sn.trim()) {
      alert("請先選擇製程並輸入序號");
      return;
    }
    const missing = (selectedProcObj.items || []).filter(item => !newImageFiles[item] && !homeNA[item]);
    if (missing.length > 0) {
      alert(`尚有項目未完成：\n${missing.join(", ")}`);
      return;
    }

    setSaving(true);
    try {
      const expectedItems = selectedProcObj.items || [];
      const uploadedImages: Record<string, string> = {};
      const itemsToUpload = expectedItems.filter(item => !homeNA[item]);

      expectedItems.filter(item => homeNA[item]).forEach(item => {
        uploadedImages[item] = NA_SENTINEL;
      });

      // --- 每 6 張一組並行上傳 ---
      const BATCH_SIZE = 6;
      for (let i = 0; i < itemsToUpload.length; i += BATCH_SIZE) {
        const batch = itemsToUpload.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (item) => {
          const file = newImageFiles[item];
          if (file) {
            const path = await uploadImage(selectedProcObj.code, selectedModel, sn.trim(), item, file);
            if (path) uploadedImages[item] = path;
          }
        }));
      }

      const { error: dbErr } = await supabase.from("reports").insert([{
        sn: sn.trim(),
        model: selectedModel,
        process_code: selectedProcObj.code,
        process_name: selectedProcObj.name,
        images: uploadedImages,
        inspector: user?.email,
      }]);

      if (dbErr) throw dbErr;

      await deleteDraftLocal(selectedProcObj.code, sn.trim());
      alert("儲存成功！");
      setSn("");
      setNewImageFiles({});
      setHomeNA({});
    } catch (err: any) {
      alert("儲存失敗：" + err.message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (selectedProcObj && sn.trim()) loadDraft(selectedProcObj.code, sn.trim());
  }, [selectedProcObj, sn]);

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h2 className="text-xl font-bold mb-4">新增檢驗紀錄 ({selectedModel})</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">產品序號 (S/N)</label>
            <Input 
              placeholder="請輸入或掃描序號" 
              value={sn} 
              onChange={(e: any) => setSn(e.target.value.toUpperCase())}
            />
          </div>
        </div>
      </Card>

      {selectedProcObj && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {selectedProcObj.items.map((item: string) => (
            <Card key={item} className={`p-4 relative border ${homeNA[item] ? "bg-gray-50 opacity-60" : "bg-white"}`}>
              <div className="flex justify-between items-start mb-2">
                <p className="font-medium text-gray-800">{item}</p>
                <label className="flex items-center text-xs text-gray-500 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mr-1 h-4 w-4"
                    checked={!!homeNA[item]}
                    onChange={(e) => {
                      const newNA = { ...homeNA, [item]: e.target.checked };
                      setHomeNA(newNA);
                      saveDraftLocal(selectedProcObj.code, sn, newImageFiles, newNA);
                    }}
                  />
                  N/A
                </label>
              </div>

              {!homeNA[item] && (
                <div className="space-y-2">
                  <Button
                    variant="secondary"
                    className="w-full h-40 border-2 border-dashed border-gray-300 relative overflow-hidden"
                    onClick={() => fileInputRefs.current[item]?.click()}
                  >
                    {newImageFiles[item] ? (
                      <img 
                        src={URL.createObjectURL(newImageFiles[item])} 
                        className="absolute inset-0 w-full h-full object-cover" 
                        alt="preview"
                      />
                    ) : (
                      "點擊/拍照上傳"
                    )}
                  </Button>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    ref={(el: any) => (fileInputRefs.current[item] = el)}
                    onChange={(e: any) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const newFiles = { ...newImageFiles, [item]: file };
                        setNewImageFiles(newFiles);
                        saveDraftLocal(selectedProcObj.code, sn, newFiles, homeNA);
                      }
                    }}
                  />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {selectedProcObj && (
        <Button className="w-full h-16 text-xl font-bold" disabled={saving} onClick={saveReport}>
          {saving ? "正在上傳..." : "提交檢驗報告"}
        </Button>
      )}
    </div>
  );
};

export default HomePage;
