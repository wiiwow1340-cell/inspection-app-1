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
  processes: Process[];
  processStatus: "idle" | "loading" | "ready" | "empty" | "error";
  processError: string;
  expandedProcessIndex: number | null;
  setExpandedProcessIndex: React.Dispatch<React.SetStateAction<number | null>>;
  addItem: () => void;
  updateItemName: (idx: number, nextValue: string) => void;
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
  processes,
  processStatus,
  processError,
  expandedProcessIndex,
  setExpandedProcessIndex,
  addItem,
  updateItemName,
  moveItemUp,
  moveItemDown,
  saveProcess,
  cancelManageCreate,
  startEditingProcess,
  setConfirmTarget,
  confirmDiscard,
  resetManageState,
}: ManagePageProps) {

  if (!isAdmin) {
    return (
      <Card className="p-4 space-y-3">
        <h2 className="text-xl font-bold text-slate-900">管理製程</h2>
        <p className="text-red-600">此頁僅限管理員帳號使用。</p>
        <p className="text-sm text-slate-600">
          目前登入：{authUsername || "未知"}
        </p>
      </Card>
    );
  }

  const isProcessLocked =
    processStatus === "loading" || processStatus === "error";
  const isProcessEmpty = processStatus === "empty";
  const isProcessError = processStatus === "error";
  const processMessage = isProcessError
    ? `製程載入失敗，暫時無法管理。${processError ? `（${processError}）` : ""}`
    : isProcessEmpty
    ? "資料庫目前沒有任何製程，可先新增製程。"
    : processStatus === "loading"
    ? "製程載入中，請稍候。"
    : "";

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

    return false;
  };

  return (
    <Card className="p-4 space-y-4">
      <h2 className="text-xl font-bold text-slate-900">管理製程</h2>
      {(isProcessLocked || isProcessEmpty) && (
        <div
          className={`rounded border px-3 py-2 text-sm ${
            isProcessError
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          {processMessage}
        </div>
      )}

      <div className="space-y-4">
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              value={newProcName}
              placeholder="製程名稱"
              onChange={(e) => setNewProcName(e.target.value)}
              disabled={isProcessLocked}
              className="border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-500"
            />
            <Input
              value={newProcCode}
              placeholder="製程代號"
              onChange={(e) => setNewProcCode(e.target.value)}
              disabled={isProcessLocked}
              className="border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-500"
            />
          </div>
          <Input
            value={newProcModel}
            placeholder="產品型號"
            onChange={(e) => setNewProcModel(e.target.value)}
            disabled={isProcessLocked}
            className="border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-500"
          />
          {editingIndex !== null && (
            <div className="text-xs text-slate-500">
              ※ 目前為「編輯製程」模式，修改後請按「更新製程」
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex w-full items-center gap-2">
            <Input
              value={newItem}
              placeholder="新增檢驗照片項目"
              onChange={(e) => setNewItem(e.target.value)}
              disabled={isProcessLocked}
              className="flex-1 min-w-0 w-auto border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-500"
            />
            <Button
              type="button"
              size="sm"
              onClick={addItem}
              disabled={isProcessLocked}
              className="shrink-0 whitespace-nowrap"
            >
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
              disabled={isProcessLocked}
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
            <Input
              value={i}
              onChange={(e) => updateItemName(idx, e.target.value)}
              disabled={isProcessLocked}
              className="flex-1 h-9 border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-500"
            />

            <div className="flex gap-2 ml-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => moveItemUp(idx)}
                disabled={isProcessLocked || idx === 0}
                title="上移"
              >
                ↑
              </Button>

              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => moveItemDown(idx)}
                disabled={isProcessLocked || idx === items.length - 1}
                title="下移"
              >
                ↓
              </Button>

              <Button
                variant="destructive"
                size="sm"
                type="button"
                onClick={() => setConfirmTarget({ type: "item", index: idx })}
                disabled={isProcessLocked}
              >
                刪除
              </Button>
            </div>
          </div>
        ))}

        <div className="flex gap-2">
          <Button
            onClick={saveProcess}
            className="flex-1"
            type="button"
            disabled={isProcessLocked}
          >
            {editingIndex !== null ? "更新製程" : "儲存製程"}
          </Button>

          {editingIndex === null ? (
            <Button
              className="flex-1"
              type="button"
              variant="secondary"
              onClick={cancelManageCreate}
              disabled={isProcessLocked}
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
              disabled={isProcessLocked}
            >
              取消編輯
            </Button>
          )}
        </div>

        <div className="border border-slate-200 rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left">
                <th className="p-2">製程名稱</th>
                <th className="p-2">製程代號</th>
                <th className="p-2">產品型號</th>
                <th className="p-2 w-24 sm:w-32">操作</th>
              </tr>
            </thead>
            <tbody>
              {processes.length === 0 ? (
                <tr className="border-t border-slate-200">
                  <td className="p-3 text-center text-slate-500" colSpan={4}>
                    {isProcessError
                      ? "無法讀取製程資料"
                      : "目前尚無製程資料"}
                  </td>
                </tr>
              ) : (
                processes.map((p, idx) => {
                  const isOpen = expandedProcessIndex === idx;
                  return (
                    <React.Fragment
                      key={`${p.name}-${p.code}-${p.model}-${idx}`}
                    >
                      <tr
                        className="border-t border-slate-200 hover:bg-slate-50 cursor-pointer"
                        onClick={() =>
                          setExpandedProcessIndex((prev) =>
                            prev === idx ? null : idx
                          )
                        }
                      >
                        <td className="p-2">{p.name}</td>
                        <td className="p-2">{p.code}</td>
                        <td className="p-2 max-w-[10rem] truncate whitespace-nowrap sm:max-w-none">
                          {p.model || "—"}
                        </td>
                        <td
                          className="p-2 w-24 sm:w-32"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex gap-1 sm:gap-2">
                            <Button
                              type="button"
                              size="sm"
                              className="px-2 sm:px-3"
                              onClick={() => startEditingProcess(idx)}
                              disabled={isProcessLocked}
                            >
                              編輯
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="px-2 sm:px-3"
                              variant="destructive"
                              onClick={() =>
                                setConfirmTarget({ type: "process", proc: p })
                              }
                              disabled={isProcessLocked}
                            >
                              刪除
                            </Button>
                          </div>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="border-t border-slate-200">
                          <td className="p-0" colSpan={4}>
                            <div className="p-3 bg-slate-50">
                              <div className="font-semibold mb-2">
                                檢驗項目
                              </div>
                              {p.items.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
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
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
