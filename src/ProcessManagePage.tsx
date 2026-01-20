import React from "react";

// Strategy Y：管理製程頁僅負責 UI 與使用者操作，
// 所有 state 與 DB 存取皆由 App.tsx 傳入

// =============================
//  簡易 UI 元件：Button / Input / Card
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
  isAdmin: boolean;
  authUsername: string;
  processes: Process[];

  newProcName: string;
  setNewProcName: (v: string) => void;
  newProcCode: string;
  setNewProcCode: (v: string) => void;
  newProcModel: string;
  setNewProcModel: (v: string) => void;

  items: string[];
  newItem: string;
  setNewItem: (v: string) => void;

  insertAfter: string;
  setInsertAfter: (v: string) => void;

  editingIndex: number | null;

  addItem: () => void;
  moveItemUp: (index: number) => void;
  moveItemDown: (index: number) => void;
  removeItem: (index: number) => void;

  startEditingItem: (index: number) => void;
  editingItemIndex: number | null;
  editingItemValue: string;
  setEditingItemValue: (v: string) => void;
  cancelEditingItem: () => void;
  saveEditingItem: () => void;

  saveProcess: () => void;
  cancelManageCreate: () => void;
  startEditingProcess: (index: number) => void;
  removeProcess: (proc: Process) => void;
};

export default function ProcessManagePage({
  visible,
  isAdmin,
  authUsername,
  processes,
  newProcName,
  setNewProcName,
  newProcCode,
  setNewProcCode,
  newProcModel,
  setNewProcModel,
  items,
  newItem,
  setNewItem,
  insertAfter,
  setInsertAfter,
  editingIndex,
  addItem,
  moveItemUp,
  moveItemDown,
  removeItem,
  startEditingItem,
  editingItemIndex,
  editingItemValue,
  setEditingItemValue,
  cancelEditingItem,
  saveEditingItem,
  saveProcess,
  cancelManageCreate,
  startEditingProcess,
  removeProcess,
}: Props) {
  if (!visible) return null;

  if (!isAdmin) {
    return (
      <Card className="p-4 space-y-3">
        <h2 className="text-xl font-bold">管理製程</h2>
        <p className="text-red-600">此頁僅限管理員帳號使用。</p>
        <p className="text-sm text-gray-600">
          目前登入：{authUsername || "未知"}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <h2 className="text-xl font-bold">管理製程</h2>

      {/* 製程基本資料 */}
      <div className="space-y-2">
        <Input
          placeholder="製程名稱"
          value={newProcName}
          onChange={(e) => setNewProcName(e.target.value)}
        />
        <Input
          placeholder="製程代號"
          value={newProcCode}
          onChange={(e) => setNewProcCode(e.target.value)}
        />
        <Input
          placeholder="產品型號"
          value={newProcModel}
          onChange={(e) => setNewProcModel(e.target.value)}
        />
      </div>

      {/* 新增檢驗項目 */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            placeholder="新增檢驗照片項目"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
          />
          <Button type="button" onClick={addItem}>
            加入
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 whitespace-nowrap">插入在</span>
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

      {/* 項目清單 */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((it, idx) => {
            const isEditing = editingItemIndex === idx;
            return (
              <div
                key={`${it}-${idx}`}
                className="border p-2 rounded flex items-center justify-between gap-2"
              >
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <Input
                      value={editingItemValue}
                      onChange={(e) => setEditingItemValue(e.target.value)}
                    />
                  ) : (
                    <div className="truncate">{it}</div>
                  )}
                </div>

                <div className="flex gap-1 shrink-0">
                  {isEditing ? (
                    <>
                      <Button size="sm" type="button" onClick={saveEditingItem}>
                        儲存
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        type="button"
                        onClick={cancelEditingItem}
                      >
                        取消
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        type="button"
                        onClick={() => startEditingItem(idx)}
                      >
                        改名
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        type="button"
                        onClick={() => moveItemUp(idx)}
                      >
                        ↑
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        type="button"
                        onClick={() => moveItemDown(idx)}
                      >
                        ↓
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        type="button"
                        onClick={() => removeItem(idx)}
                      >
                        刪
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 儲存 / 取消 */}
      <div className="flex gap-2">
        <Button type="button" className="flex-1" onClick={saveProcess}>
          {editingIndex !== null ? "更新製程" : "新增製程"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={cancelManageCreate}
        >
          取消
        </Button>
      </div>

      {/* 既有製程清單 */}
      <div className="pt-2 space-y-2">
        {processes.map((p, idx) => (
          <div
            key={`${p.name}-${p.model}-${idx}`}
            className="border p-2 rounded"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold truncate">
                  {p.name} ({p.code})
                </div>
                <div className="text-sm text-gray-600 truncate">型號：{p.model}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" type="button" onClick={() => startEditingProcess(idx)}>
                  編輯
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  type="button"
                  onClick={() => removeProcess(p)}
                >
                  刪除
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
