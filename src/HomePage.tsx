import React from "react";

// Strategy Y：僅負責查詢頁 UI 與互動，所有 state / DB 操作由 App.tsx 傳入

// =============================
//  簡易 UI 元件：Button / Card
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

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

const Card: React.FC<CardProps> = ({ className = "", ...props }) => (
  <div
    className={`rounded-lg border border-gray-200 bg-white shadow-sm ${className}`}
    {...props}
  />
);

type Report = {
  id: string;
  serial: string;
  model: string;
  process: string;
  images: Record<string, string>;
  expected_items: string[];
};

type Props = {
  visible: boolean;

  // 資料（App 已先套用 queryFilters 的結果）
  reports: Report[];

  // 篩選條件（UI 綁定）
  selectedProcessFilter: string;
  setSelectedProcessFilter: (v: string) => void;

  selectedModelFilter: string;
  setSelectedModelFilter: (v: string) => void;

  selectedStatusFilter: string;
  setSelectedStatusFilter: (v: string) => void;

  // 按下查詢後正式生效
  onQuery: () => void;

  // 展開 / 編輯控制（由 App 管理）
  expandedReportId: string | null;
  toggleExpandReport: (id: string) => void;
  toggleEditReport: (id: string) => void;
  editingReportId: string | null;

  // 製程 / 型號選項
  processOptions: string[];
  modelOptions: string[];
};

export default function QueryReportPage({
  visible,
  reports,
  selectedProcessFilter,
  setSelectedProcessFilter,
  selectedModelFilter,
  setSelectedModelFilter,
  selectedStatusFilter,
  setSelectedStatusFilter,
  onQuery,
  expandedReportId,
  toggleExpandReport,
  toggleEditReport,
  editingReportId,
  processOptions,
  modelOptions,
}: Props) {
  if (!visible) return null;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold">查看報告</h2>
        <Button type="button" onClick={onQuery}>
          查詢
        </Button>
      </div>

      {/* 篩選條件 */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          className="border p-2 rounded w-full sm:flex-1 min-w-0"
          value={selectedProcessFilter}
          onChange={(e) => setSelectedProcessFilter(e.target.value)}
        >
          <option value="">全部製程</option>
          {processOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          className="border p-2 rounded w-full sm:flex-1 min-w-0"
          value={selectedModelFilter}
          onChange={(e) => setSelectedModelFilter(e.target.value)}
        >
          <option value="">全部型號</option>
          {modelOptions.map((m) => (
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

      {/* 報告列表 */}
      {reports.length === 0 ? (
        <p className="text-sm text-gray-600">尚無報告</p>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const isOpen = expandedReportId === r.id;
            const isEditing = editingReportId === r.id;

            return (
              <div key={r.id} className="border rounded-lg overflow-hidden">
                <button
                  type="button"
                  className="w-full text-left p-3 bg-white"
                  onClick={() => toggleExpandReport(r.id)}
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
                    >
                      {isEditing ? "編輯中" : "編輯"}
                    </Button>
                  </div>

                  <div className="mt-2 space-y-1 text-sm text-gray-700">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate">製程：{r.process}</div>
                      <div className="truncate">型號：{r.model}</div>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm text-gray-600">
                      <div className="truncate">序號：{r.serial}</div>
                      <div className="text-xs text-gray-500">
                        {isOpen ? "▼ 已展開" : "▶ 點此展開"}
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
