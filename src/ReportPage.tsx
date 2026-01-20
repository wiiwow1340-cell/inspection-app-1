import React from "react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

// Strategy Y：Page 僅負責 render，所有狀態與邏輯由 App.tsx 傳入

type Process = {
  name: string;
  code: string;
  model: string;
  items: string[];
};

type Props = {
  visible: boolean;

  serial: string;
  setSerial: (v: string) => void;

  selectedModel: string;
  setSelectedModel: (v: string) => void;

  selectedProcess: string;
  setSelectedProcess: (v: string) => void;

  productModels: string[];
  filteredProcesses: Process[];
  selectedProcObj: Process | null;

  images: Record<string, string>;
  homeNA: Record<string, boolean>;
  setHomeNA: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;

  handleCapture: (item: string, file: File | undefined) => void;

  onSubmit: () => void;
};

export default function NewReportPage({
  visible,
  serial,
  setSerial,
  selectedModel,
  setSelectedModel,
  selectedProcess,
  setSelectedProcess,
  productModels,
  filteredProcesses,
  selectedProcObj,
  images,
  homeNA,
  setHomeNA,
  handleCapture,
  onSubmit,
}: Props) {
  if (!visible) return null;

  return (
    <Card className="p-4 space-y-4">
      <h2 className="text-xl font-bold">新增檢驗資料</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="space-y-4"
      >
        <div className="space-y-1">
          <label className="text-sm font-medium">序號</label>
          <Input
            placeholder="輸入序號"
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            className={serial ? "" : "border-red-500"}
          />
          {!serial && <p className="text-red-500 text-sm">此欄位為必填</p>}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">產品型號</label>
          <select
            value={selectedModel}
            onChange={(e) => {
              setSelectedModel(e.target.value);
              setSelectedProcess("");
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

        <div className="space-y-1">
          <label className="text-sm font-medium">製程</label>
          <select
            value={selectedProcess}
            onChange={(e) => setSelectedProcess(e.target.value)}
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

        {selectedProcObj && selectedProcObj.items.length > 0 && (
          <div className="space-y-2 mt-2">
            {selectedProcObj.items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="flex-1">{item}</span>

                <Button
                  type="button"
                  onClick={() =>
                    document.getElementById(`capture-${idx}`)?.click()
                  }
                  className="px-2 py-1"
                >
                  拍照
                </Button>

                <Button
                  type="button"
                  onClick={() =>
                    document.getElementById(`upload-${idx}`)?.click()
                  }
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
                    handleCapture(item, e.target.files?.[0] || undefined)
                  }
                />

                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id={`upload-${idx}`}
                  onChange={(e) =>
                    handleCapture(item, e.target.files?.[0] || undefined)
                  }
                />

                {homeNA[item] ? (
                  <button
                    type="button"
                    className="w-8 h-8 inline-flex items-center justify-center text-gray-600"
                    onClick={() =>
                      setHomeNA((prev) => {
                        const next = { ...prev };
                        delete next[item];
                        return next;
                      })
                    }
                  >
                    <StatusIcon kind="na" />
                  </button>
                ) : images[item] ? (
                  <button
                    type="button"
                    className="w-8 h-8 inline-flex items-center justify-center text-green-600"
                    onClick={() =>
                      setHomeNA((prev) => ({ ...prev, [item]: true }))
                    }
                  >
                    <StatusIcon kind="ok" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="w-8 h-8 inline-flex items-center justify-center text-gray-400"
                    onClick={() =>
                      setHomeNA((prev) => ({ ...prev, [item]: true }))
                    }
                  >
                    <StatusIcon kind="ng" />
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
        </div>
      </form>
    </Card>
  );
}