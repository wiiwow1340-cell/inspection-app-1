import React from "react";

// Strategy Y：Page 僅負責 render，所有狀態與邏輯由 App.tsx 傳入

// =============================
//  簡易 UI 元件：Button / Input / Card
//  （為了維持 4 檔結構，不依賴 shadcn / @/ 路徑）
// =============================

type ButtonVariant = "default" | "secondary" | "destructive";
type ButtonSize = "default" | "sm";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant | string;
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
  onCancel?: () => void;
};

export default function HomePage({
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
  onCancel,
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

        {selectedProcObj && (
          <div className="space-y-2">
            <h3 className="font-semibold">檢驗照片</h3>

            {/* 讓每個項目呈現更接近你原本的「名稱 + 右側 N/A」視覺 */}
            {selectedProcObj.items.map((it) => {
              const isNA = !!homeNA[it];
              const preview = images[it];

              return (
                <div key={it} className="border rounded p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium break-all">{it}</div>

                    <label className="flex items-center gap-2 text-sm text-gray-700 select-none shrink-0">
                      <input
                        type="checkbox"
                        checked={isNA}
                        onChange={(e) =>
                          setHomeNA((prev) => ({
                            ...prev,
                            [it]: e.target.checked,
                          }))
                        }
                      />
                      N/A
                    </label>
                  </div>

                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={isNA}
                    onChange={(e) => handleCapture(it, e.target.files?.[0])}
                    className="block w-full text-sm"
                  />

                  {/* 預覽：保留，但更小、更像原本「可拍可看」 */}
                  {preview && !isNA && (
                    <img
                      src={preview}
                      alt={it}
                      className="w-full rounded border max-h-64 object-contain"
                    />
                  )}

                  {isNA && (
                    <div className="text-sm text-gray-500">此項已標記為 N/A</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-2">
          <Button type="submit" className="flex-1">
            確認儲存
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => (onCancel ? onCancel() : undefined)}
          >
            取消
          </Button>
        </div>
      </form>
    </Card>
  );
}
