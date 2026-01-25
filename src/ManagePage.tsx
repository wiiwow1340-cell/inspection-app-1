import React from "react";
import type { Process } from "./types";

type ButtonComponent = React.ComponentType<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
    className?: string;
  }
>;

type InputComponent = React.ComponentType<
  React.InputHTMLAttributes<HTMLInputElement> & { className?: string }
>;

type CardComponent = React.ComponentType<
  React.HTMLAttributes<HTMLDivElement> & { className?: string }
>;

type ConfirmTarget =
  | { type: "item"; index: number }
  | { type: "process"; proc: Process }
  | null;

type ManagePageProps = {
  Card: CardComponent;
  Button: ButtonComponent;
  Input: InputComponent;
  isAdmin: boolean;
  authUsername: string;
  newProcName: string;
  setNewProcName: React.Dispatch<React.SetStateAction<string>>;
  newProcCode: string;
  setNewProcCode: React.Dispatch<React.SetStateAction<string>>;
  newProcModel: string;
  setNewProcModel: React.Dispatch<React.SetStateAction<string>>;
  editingIndex: number | null;
  newItem: string;
  setNewItem: React.Dispatch<React.SetStateAction<string>>;
  insertAfter: string;
  setInsertAfter: React.Dispatch<React.SetStateAction<string>>;
  items: string[];
  editingItemIndex: number | null;
  editingItemValue: string;
  setEditingItemValue: React.Dispatch<React.SetStateAction<string>>;
  processes: Process[];
  expandedProcessIndex: number | null;
  setExpandedProcessIndex: React.Dispatch<React.SetStateAction<number | null>>;
  addItem: () => void;
  startEditingItem: (idx: number) => void;
  saveEditingItem: () => void;
  cancelEditingItem: () => void;
  moveItemUp: (idx: number) => void;
  moveItemDown: (idx: number) => void;
  saveProcess: () => void;
  cancelManageCreate: () => void;
  startEditingProcess: (idx: number) => void;
  setConfirmTarget: (target: ConfirmTarget) => void;
  confirmDiscard: (message?: string) => boolean;
  resetManageState: (shouldResetFields: boolean) => Promise<void>;
};

export default function ManagePage({
  Card,
  Button,
  Input,
  isAdmin,
  authUsername,
  newProcName,
  setNewProcName,
  newProcCode,
  setNewProcCode,
  newProcModel,
  setNewProcModel,
  editingIndex,
  newItem,
  setNewItem,
  insertAfter,
  setInsertAfter,
  items,
  editingItemIndex,
  editingItemValue,
  setEditingItemValue,
  processes,
  expandedProcessIndex,
  setExpandedProcessIndex,
  addItem,
  startEditingItem,
  saveEditingItem,
  cancelEditingItem,
  moveItemUp,
  moveItemDown,
  saveProcess,
  cancelManageCreate,
  startEditingProcess,
  setConfirmTarget,
  confirmDiscard,
  resetManageState,
}: ManagePageProps) {
  const processCellBase =
    "px-3 py-2 text-xs sm:text-sm whitespace-nowrap align-middle";
  const processHeaderCell = "font-semibold text-slate-600 text-left";
  const processRowCell = "text-slate-700 text-left";

  if (!isAdmin) {
    return (
      <Card className="space-y-3 p-3 sm:p-4">
        <h2 className="text-xl font-bold text-slate-900">管理製程</h2>
        <p className="text-red-600">此頁僅限管理員帳號使用。</p>
        <p className="text-sm text-slate-600">
          目前登入：{authUsername || "未知"}
        </p>
      </Card>
    );
  }

  const isEditingProcessDirty = () => {
    if (editingIndex === null) return false;
    const original = processes[editingIndex];
    if (!original) return true;

    if (newProcName.trim() !== original.name) return true;
    if (newProcCode.trim() !== original.code) return true;
    if (newProcModel.trim() !== (original.model || "")) return true;

    const originalItems = original.items || [];
    if (items.length !== originalItems.length) return true;
    if (items.some((item, idx) => item !== originalItems[idx])) return true;

    if (newItem.trim()) return true;

    if (editingItemIndex !== null) {
      const originalItem = items[editingItemIndex] ?? "";
      if (editingItemValue.trim() !== originalItem.trim()) return true;
    }

    return false;
  };

  return (
    <Card className="space-y-4 p-3 sm:p-4">
      <h2 className="text-xl font-bold text-slate-900">管理製程</h2>

      <div className="space-y-4">
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              value={newProcName}
              placeholder="製程名稱"
              onChange={(e) => setNewProcName(e.target.value)}
              className="border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-500"
            />
            <Input
              value={newProcCode}
              placeholder="代號"
              onChange={(e) => setNewProcCode(e.target.value)}
              className="border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-500"
            />
          </div>
          <Input
            value={newProcModel}
            placeholder="產品型號"
            onChange={(e) => setNewProcModel(e.target.value)}
            className="border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-500"
          />
          {editingIndex !== null && (
            <div className="text-xs text-slate-500">
              ※ 目前為「編輯製程」模式，修改後請按「更新製程」
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={newItem}
              placeholder="新增檢驗照片項目"
              onChange={(e) => setNewItem(e.target.value)}
              className="border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-500"
            />
            <Button type="button" size="sm" onClick={addItem}>
              加入
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600 whitespace-nowrap">
              插入在
            </span>
            <select
              value={insertAfter}
              onChange={(e) => setInsertAfter(e.target.value)}
              className="border border-slate-200 bg-white text-slate-900 p-2 rounded flex-1 h-9 focus-visible:outline-none focus-visible:border-blue-500"
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

        {items.map((i, idx) => (
          <div
            key={idx}
            className="border border-slate-200 p-2 rounded flex justify-between items-center"
          >
            {editingItemIndex === idx ? (
              <div className="flex-1 flex gap-2 items-center">
                <Input
                  value={editingItemValue}
                  onChange={(e) => setEditingItemValue(e.target.value)}
                  className="h-9 border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-500"
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
                if (
                  isEditingProcessDirty() &&
                  !confirmDiscard("確定要取消編輯製程嗎？")
                ) {
                  return;
                }
                await resetManageState(false);
              }}
            >
              取消編輯
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <table className="w-full min-w-max table-auto border-collapse">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <th
                    className={`${processCellBase} ${processHeaderCell} whitespace-nowrap`}
                  >
                    製程名稱
                  </th>
                  <th
                    className={`${processCellBase} ${processHeaderCell} whitespace-nowrap`}
                  >
                    產品型號
                  </th>
                  <th
                    className={`${processCellBase} ${processHeaderCell} whitespace-nowrap text-center sm:text-left`}
                  >
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {processes.map((p, idx) => {
                  const isOpen = expandedProcessIndex === idx;
                  const toggleRow = () =>
                    setExpandedProcessIndex((prev) =>
                      prev === idx ? null : idx
                    );

                  return (
                    <React.Fragment
                      key={`${p.name}-${p.code}-${p.model}-${idx}`}
                    >
                      <tr className="border-t border-slate-200 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                        <td
                          className={`${processCellBase} ${processRowCell} cursor-pointer`}
                          role="button"
                          tabIndex={0}
                          aria-expanded={isOpen}
                          onClick={toggleRow}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              toggleRow();
                            }
                          }}
                        >
                          <span className="font-semibold text-slate-900">
                            {p.name}
                            {p.code ? `(${p.code})` : ""}
                          </span>
                        </td>
                        <td
                          className={`${processCellBase} ${processRowCell} cursor-pointer`}
                          onClick={toggleRow}
                        >
                          {p.model || "—"}
                        </td>
                        <td
                          className={`${processCellBase} ${processRowCell} whitespace-nowrap`}
                        >
                          <div className="flex items-center justify-start gap-1">
                            <Button
                              type="button"
                              size="sm"
                              className="writing-vertical px-1 py-1 text-xs leading-tight"
                              onClick={() => startEditingProcess(idx)}
                            >
                              編輯
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              className="writing-vertical px-1 py-1 text-xs leading-tight"
                              onClick={() =>
                                setConfirmTarget({ type: "process", proc: p })
                              }
                            >
                              刪除
                            </Button>
                          </div>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="border-t border-slate-200 bg-slate-50">
                          <td
                            colSpan={3}
                            className="px-3 py-3 text-xs sm:text-sm"
                          >
                            <div className="font-semibold mb-2">檢驗項目</div>
                            {p.items.length > 0 ? (
                              <div className="space-y-2">
                                {p.items.map((item, iidx) => (
                                  <div
                                    key={iidx}
                                    className="bg-white border border-slate-200 rounded px-3 py-2"
                                  >
                                    {item}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-slate-500">
                                尚未建立檢驗項目
                              </div>
                            )}
                            <div className="text-xs text-slate-500 mt-2">
                              ※ 若要修改此製程內容，請按上方「編輯」並於上方區塊更新後按「更新製程」
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
      </div>
    </Card>
  );
}
