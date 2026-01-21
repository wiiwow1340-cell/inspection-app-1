import React from "react";

export default function HomePage(props: any) {
  const {
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
    setImages,
    newImageFiles,
    setNewImageFiles,
    homeNA,
    setHomeNA,
    handleCapture,
    resetNewReportState,
    setPreviewIndex,
    setShowPreview,
    Card,
    Button,
    Input,
    StatusIcon,
  } = props;

  return (
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
              setImages({});
              setNewImageFiles({});
              setHomeNA({});
            }}
            className={`w-full border p-2 rounded ${
              selectedModel ? "" : "border-red-500"
            }`}
          >
            <option value="">請選擇型號</option>
            {productModels.map((m: string) => (
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
            {filteredProcesses.map((p: any) => (
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
            {selectedProcObj.items.map((item: string, idx: number) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="flex-1">{item}</span>

                <Button
                  type="button"
                  onClick={() =>
                    (document.getElementById(
                      `capture-${idx}`
                    ) as HTMLInputElement)?.click()
                  }
                >
                  拍照
                </Button>

                <Button
                  type="button"
                  onClick={() =>
                    (document.getElementById(
                      `upload-${idx}`
                    ) as HTMLInputElement)?.click()
                  }
                >
                  上傳
                </Button>

                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  id={`capture-${idx}`}
                  className="hidden"
                  onChange={(e) =>
                    handleCapture(item, e.target.files?.[0])
                  }
                />
                <input
                  type="file"
                  accept="image/*"
                  id={`upload-${idx}`}
                  className="hidden"
                  onChange={(e) =>
                    handleCapture(item, e.target.files?.[0])
                  }
                />

                {homeNA[item] ? (
                  <button
                    type="button"
                    onClick={() =>
                      setHomeNA((prev: any) => {
                        const n = { ...prev };
                        delete n[item];
                        return n;
                      })
                    }
                  >
                    <StatusIcon kind="na" />
                  </button>
                ) : images[item] ? (
                  <button
                    type="button"
                    onClick={() =>
                      setHomeNA((prev: any) => ({ ...prev, [item]: true }))
                    }
                  >
                    <StatusIcon kind="ok" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setHomeNA((prev: any) => ({ ...prev, [item]: true }))
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
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={async () => {
              const ok = window.confirm(
                "確定要取消新增嗎？\n（已輸入的資料與照片將會清除）"
              );
              if (ok) await resetNewReportState(true);
            }}
          >
            取消新增
          </Button>
        </div>
      </form>
    </Card>
  );
}
