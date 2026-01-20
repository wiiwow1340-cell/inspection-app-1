import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Strategy Y：管理製程頁僅負責 UI 與使用者操作，
// 所有 state 與 DB 存取皆由 App.tsx 傳入

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

  // 建立 / 編輯製程
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

  // 動作 callback（邏輯在 App）
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

      {/* 檢驗項目 */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            placeholder="新增檢驗項目"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
          />
          <Button type="button" onClick={addItem}>
            新增
          </Button>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">插入位置</label>
          <select
            className="w-full border p-2 rounded"
            value={insertAfter}
            onChange={(e) => setInsertAfter(e.target.value)}
          >
            <option value="">插在最後</option>
            {items.map((it, idx) => (
              <option key={idx} value={it}>
                插在「{it}」後
              </option>
            ))}
          </select>
        </div>


        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            {editingItemIndex === idx ? (
              <>
                <Input
                  value={editingItemValue}
                  onChange={(e) => setEditingItemValue(e.target.value)}
                />
                <Button size="sm" onClick={saveEditingItem}>
                  儲存
                </Button>
                <Button size="sm" variant="secondary" onClick={cancelEditingItem}>
                  取消
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1">{item}</span>
                <Button size="sm" onClick={() => startEditingItem(idx)}>
                  編輯
                </Button>
                <Button size="sm" onClick={() => moveItemUp(idx)}>↑</Button>
                <Button size="sm" onClick={() => moveItemDown(idx)}>↓</Button>
                <Button size="sm" variant="destructive" onClick={() => removeItem(idx)}>
                  刪除
                </Button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* 操作 */}
      <div className="flex gap-2">
        <Button onClick={saveProcess} className="flex-1">
          {editingIndex !== null ? "更新製程" : "儲存製程"}
        </Button>
        <Button variant="secondary" onClick={cancelManageCreate} className="flex-1">
          取消
        </Button>
      </div>

      {/* 既有製程列表 */}
      <div className="space-y-2 mt-4">
        {processes.map((p, idx) => (
          <div key={idx} className="flex items-center justify-between border p-2 rounded">
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="text-sm text-gray-600">
                {p.code} / {p.model}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => startEditingProcess(idx)}>
                編輯
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => removeProcess(p)}
              >
                刪除
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}