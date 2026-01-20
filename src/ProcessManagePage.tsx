import React, { useState } from "react";

interface ProcessManagePageProps {
  supabase: any;
  processes: any[];
  fetchProcesses: () => Promise<void>;
  // 樣式元件 (從 App.tsx 傳入)
  Button: any;
  Input: any;
  Card: any;
}

const ProcessManagePage: React.FC<ProcessManagePageProps> = ({
  supabase,
  processes,
  fetchProcesses,
  Button,
  Input,
  Card
}) => {
  // --- 狀態管理 (完全複製原版) ---
  const [newProcName, setNewProcName] = useState("");
  const [newProcCode, setNewProcCode] = useState("");
  const [editingProc, setEditingProc] = useState<any>(null);
  const [tempItems, setTempItems] = useState<string[]>([]);
  const [confirmTarget, setConfirmTarget] = useState<{ type: "item" | "process"; index?: number; proc?: any } | null>(null);

  // --- 邏輯操作 (完全複製原版) ---
  const addProcess = async () => {
    if (!newProcName.trim() || !newProcCode.trim()) return;
    try {
      const { error } = await supabase.from("processes").insert([
        { name: newProcName.trim(), code: newProcCode.trim(), items: [] },
      ]);
      if (error) throw error;
      setNewProcName("");
      setNewProcCode("");
      fetchProcesses();
    } catch (err: any) {
      alert("新增失敗：" + err.message);
    }
  };

  const removeProcess = async (proc: any) => {
    try {
      const { error } = await supabase.from("processes").delete().eq("id", proc.id);
      if (error) throw error;
      fetchProcesses();
    } catch (err: any) {
      alert("刪除失敗：" + err.message);
    }
  };

  const startEdit = (proc: any) => {
    setEditingProc(proc);
    setTempItems([...(proc.items || [])]);
  };

  const addItem = () => setTempItems([...tempItems, ""]);
  const updateItemText = (idx: number, val: string) => {
    const next = [...tempItems];
    next[idx] = val;
    setTempItems(next);
  };
  const removeItem = (idx: number) => {
    setTempItems(tempItems.filter((_, i) => i !== idx));
  };

  const saveEdit = async () => {
    if (!editingProc) return;
    try {
      const filtered = tempItems.map((s) => s.trim()).filter(Boolean);
      const { error } = await supabase
        .from("processes")
        .update({ items: filtered })
        .eq("id", editingProc.id);
      if (error) throw error;
      setEditingProc(null);
      fetchProcesses();
    } catch (err: any) {
      alert("儲存失敗：" + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* 新增製程區 */}
      <Card className="p-4">
        <h2 className="text-xl font-bold mb-4">管理製程項目</h2>
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="製程名稱 (如: 最終檢驗)"
            value={newProcName}
            onChange={(e: any) => setNewProcName(e.target.value)}
          />
          <Input
            placeholder="代碼 (如: FQC)"
            value={newProcCode}
            onChange={(e: any) => setNewProcCode(e.target.value)}
          />
          <Button onClick={addProcess}>新增</Button>
        </div>
      </Card>

      {/* 製程列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {processes.map((p) => (
          <Card key={p.id} className="p-4 flex justify-between items-center">
            <div>
              <p className="font-bold">{p.name} ({p.code})</p>
              <p className="text-sm text-gray-500">項目數量: {p.items?.length || 0}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => startEdit(p)}>編輯項目</Button>
              <Button size="sm" variant="destructive" onClick={() => setConfirmTarget({ type: "process", proc: p })}>刪除</Button>
            </div>
          </Card>
        ))}
      </div>

      {/* 編輯項目 Modal (100% 原版介面) */}
      {editingProc && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md bg-white p-6 max-h-[80vh] flex flex-col">
            <h3 className="text-lg font-bold mb-4">編輯項目: {editingProc.name}</h3>
            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {tempItems.map((it, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input value={it} onChange={(e: any) => updateItemText(idx, e.target.value)} />
                  <Button variant="destructive" size="sm" onClick={() => setConfirmTarget({ type: "item", index: idx })}>刪除</Button>
                </div>
              ))}
              <Button variant="secondary" className="w-full" onClick={addItem}>+ 新增項目</Button>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditingProc(null)}>取消</Button>
              <Button onClick={saveEdit}>儲-存修改</Button>
            </div>
          </Card>
        </div>
      )}

      {/* 刪除確認 Modal (100% 原版介面) */}
      {confirmTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded shadow w-72 space-y-4">
            <p className="text-lg font-bold">⚠ 確定要刪除？</p>
            <p className="text-sm text-gray-600">此動作無法復原。</p>
            <div className="flex gap-2">
              <Button className="flex-1" variant="secondary" onClick={() => setConfirmTarget(null)}>取消</Button>
              <Button className="flex-1" variant="destructive" onClick={() => {
                if (confirmTarget.type === "item") removeItem(confirmTarget.index!);
                if (confirmTarget.type === "process") removeProcess(confirmTarget.proc);
                setConfirmTarget(null);
              }}>刪除</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcessManagePage;
