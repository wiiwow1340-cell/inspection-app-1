import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// 型別定義
type Process = {
  name: string
  code: string
  model: string
  items: string[]
}

type Report = {
  id: string
  serial: string
  model: string
  process: string
  images: Record<string, string> // { [itemName]: base64 }
}

type ConfirmTarget =
  | { type: 'item'; index: number }
  | { type: 'process'; proc: Process }
  | null

// 檢驗 APP 主程式（單檔版，含預覽與管理功能）
export default function App() {
  /*** 狀態區 ***/
  const [page, setPage] = useState<'home' | 'reports' | 'manage'>('home')

  // 新增檢驗資料用
  const [serial, setSerial] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [selectedProcess, setSelectedProcess] = useState('')
  const [images, setImages] = useState<Record<string, string>>({})

  // 製程 / 報告資料
  const [processes, setProcesses] = useState<Process[]>([
    {
      name: '性能測試',
      code: 'PT',
      model: 'TC1288',
      items: ['測試照片1', '測試照片2'],
    },
    {
      name: '外觀檢驗',
      code: 'PR',
      model: 'TC588',
      items: ['外觀正面', '外觀側面'],
    },
  ])

  const [reports, setReports] = useState<Report[]>([])

  // 查看報告：查詢後才顯示
  const [showReports, setShowReports] = useState(false)

  // 管理製程用
  const [newProcName, setNewProcName] = useState('')
  const [newProcCode, setNewProcCode] = useState('')
  const [newProcModel, setNewProcModel] = useState('')
  const [newItem, setNewItem] = useState('')
  const [items, setItems] = useState<string[]>([])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  // 查看報告：就地編輯照片
  const [editingReportId, setEditingReportId] = useState<string | null>(null)
  const [editImages, setEditImages] = useState<Record<string, string>>({})

  // ⭐ 編輯儲存前預覽
  const [showEditPreview, setShowEditPreview] = useState(false)
  const [editPreviewIndex, setEditPreviewIndex] = useState(0)

  // 查看報告：篩選條件（UI 綁定）
  const [selectedProcessFilter, setSelectedProcessFilter] = useState('')
  const [selectedModelFilter, setSelectedModelFilter] = useState('')
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('') // '' | 'done' | 'not'

  // ⭐ 查詢正式條件（按「查詢」後才生效）
  const [queryFilters, setQueryFilters] = useState({
    process: '',
    model: '',
    status: '',
  })

  // 刪除確認 Modal 用
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>(null)

  // ⭐ 儲存前預覽 Modal 開關（新增檢驗）
  const [showPreview, setShowPreview] = useState(false)
  // ⭐ 預覽目前所在的檢驗項目索引（新增檢驗）
  const [previewIndex, setPreviewIndex] = useState(0)

  /*** 共用計算 ***/

  // 取得所有產品型號（不重複）
  const productModels = Array.from(
    new Set(processes.map((p) => p.model).filter(Boolean)),
  )

  // 依型號過濾製程（新增檢驗資料頁用）
  const filteredProcesses = selectedModel
    ? processes.filter((p) => p.model === selectedModel)
    : processes

  const selectedProcObj =
    processes.find((p) => p.name === selectedProcess) || null

  // 報告頁篩選（使用 queryFilters，而不是即時的 selectedXXXFilter）
  const filteredReports = reports.filter((r) => {
    // 1. 製程
    if (queryFilters.process && r.process !== queryFilters.process) return false

    // 2. 型號
    if (queryFilters.model && r.model !== queryFilters.model) return false

    // 3. 完成狀態（全部拍完才算已完成）
    if (queryFilters.status === 'done') {
      const proc = processes.find((p) => p.name === r.process)
      if (!proc) return false
      const allDone = proc.items.every((item) => r.images[item])
      if (!allDone) return false
    }

    if (queryFilters.status === 'not') {
      const proc = processes.find((p) => p.name === r.process)
      if (!proc) return false
      const notDone = proc.items.some((item) => !r.images[item])
      if (!notDone) return false
    }

    return true
  })

  /*** 工具函式 ***/

  // 產生表單編號：PT-YYYYMMDDXXX
  const genFormId = (procName: string) => {
    const prefix = processes.find((p) => p.name === procName)?.code || 'XX'
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const num = (reports.length + 1).toString().padStart(3, '0')
    return `${prefix}-${date}${num}`
  }

  // 新增 / 更新報告（真正寫入 reports）
  const saveReport = () => {
    if (!serial || !selectedModel || !selectedProcess) {
      alert('請先輸入序號、選擇型號與製程')
      return
    }

    const id = genFormId(selectedProcess)
    const newReport: Report = {
      id,
      serial,
      model: selectedModel,
      process: selectedProcess,
      images: { ...images },
    }

    setReports((prev) => [...prev, newReport])

    // 清空
    setSerial('')
    setSelectedModel('')
    setSelectedProcess('')
    setImages({})
    setPreviewIndex(0)

    alert(`已建立報告：${id}`)
  }

  // 新增檢驗頁：拍照 / 上傳處理（壓縮 + base64）
  const handleCapture = (item: string, file: File | undefined) => {
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const maxSide = 1600
        let { width, height } = img
        if (width > height) {
          if (width > maxSide) {
            height *= maxSide / width
            width = maxSide
          }
        } else {
          if (height > maxSide) {
            width *= maxSide / height
            height = maxSide
          }
        }

        canvas.width = width
        canvas.height = height
        ctx.drawImage(img, 0, 0, width, height)

        const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
        setImages((prev) => ({ ...prev, [item]: dataUrl }))
      }
      if (typeof reader.result === 'string') {
        img.src = reader.result
      }
    }
    reader.readAsDataURL(file)
  }

  // 報告編輯頁：拍照 / 上傳處理（更新 editImages）
  const handleEditCapture = (item: string, file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setEditImages((prev) => ({ ...prev, [item]: reader.result as string }))
    }
    reader.readAsDataURL(file)
  }

  /*** 管理製程相關 ***/

  const addProcess = (proc: Process) => setProcesses((prev) => [...prev, proc])

  const removeProcess = (proc: Process) => {
    setProcesses((prev) => prev.filter((p) => p !== proc))
  }

  const addItem = () => {
    if (!newItem.trim()) return
    setItems((prev) => [...prev, newItem.trim()])
    setNewItem('')
  }

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const saveProcess = () => {
    if (!newProcName.trim() || !newProcCode.trim() || !newProcModel.trim()) {
      alert('請輸入製程名稱、代號與產品型號')
      return
    }

    const updatedProcess: Process = {
      name: newProcName.trim(),
      code: newProcCode.trim(),
      model: newProcModel.trim(),
      items: [...items],
    }

    if (editingIndex !== null) {
      setProcesses((prev) => {
        const copy = [...prev]
        copy[editingIndex] = updatedProcess
        return copy
      })
      setEditingIndex(null)
    } else {
      addProcess(updatedProcess)
    }

    setNewProcName('')
    setNewProcCode('')
    setNewProcModel('')
    setItems([])
  }

  const startEditingProcess = (index: number) => {
    const proc = processes[index]
    setNewProcName(proc.name)
    setNewProcCode(proc.code)
    setNewProcModel(proc.model || '')
    setItems(proc.items || [])
    setEditingIndex(index)
  }

  /*** UI ***/

  return (
    <div className="p-4 max-w-xl mx-auto space-y-4">
      {/* 上方主選單 */}
      <div className="flex justify-between items-center space-x-2">
        <Button onClick={() => setPage('home')}>➕ 新增檢驗資料</Button>
        <Button onClick={() => setPage('reports')}>📑 查看報告</Button>
        <Button onClick={() => setPage('manage')}>⚙️ 管理製程</Button>
      </div>

      {/* 新增檢驗資料頁 */}
      {page === 'home' && (
        <Card className="p-4 space-y-4">
          <h2 className="text-xl font-bold">新增檢驗資料</h2>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!serial || !selectedModel || !selectedProcess) {
                alert('請先輸入序號、選擇型號與製程')
                return
              }
              // 打開預覽視窗（新增檢驗用）
              setPreviewIndex(0)
              setShowPreview(true)
            }}
            className="space-y-4"
          >
            {/* 序號 */}
            <div className="space-y-1">
              <label className="text-sm font-medium">序號</label>
              <Input
                placeholder="輸入序號"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                className={serial ? '' : 'border-red-500'}
              />
              {!serial && (
                <p className="text-red-500 text-sm">此欄位為必填</p>
              )}
            </div>

            {/* 產品型號 */}
            <div className="space-y-1">
              <label className="text-sm font-medium">產品型號</label>
              <select
                value={selectedModel}
                onChange={(e) => {
                  setSelectedModel(e.target.value)
                  setSelectedProcess('')
                  setImages({})
                }}
                className={`w-full border p-2 rounded ${
                  selectedModel ? '' : 'border-red-500'
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

            {/* 製程 */}
            <div className="space-y-1">
              <label className="text-sm font-medium">製程</label>
              <select
                value={selectedProcess}
                onChange={(e) => {
                  setSelectedProcess(e.target.value)
                  setImages({})
                }}
                className={`w-full border p-2 rounded ${
                  selectedProcess ? '' : 'border-red-500'
                }`}
              >
                <option value="">請選擇製程</option>
                {filteredProcesses.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
              {!selectedProcess && (
                <p className="text-red-500 text-sm">此欄位為必填</p>
              )}
            </div>

            {/* 檢驗項目 + 拍照/上傳按鈕 */}
            {selectedProcObj && selectedProcObj.items.length > 0 && (
              <div className="space-y-2 mt-2">
                {selectedProcObj.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="flex-1">{item}</span>

                    <Button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById(
                          `capture-${idx}`,
                        ) as HTMLInputElement
                        input?.click()
                      }}
                      className="px-2 py-1"
                    >
                      📷 拍照
                    </Button>

                    <Button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById(
                          `upload-${idx}`,
                        ) as HTMLInputElement
                        input?.click()
                      }}
                      className="px-2 py-1"
                    >
                      📁 上傳
                    </Button>

                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      id={`capture-${idx}`}
                      onChange={(e) =>
                        handleCapture(item, e.target.files?.[0])
                      }
                    />

                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id={`upload-${idx}`}
                      onChange={(e) =>
                        handleCapture(item, e.target.files?.[0])
                      }
                    />

                    {images[item] && (
                      <span className="text-green-600 font-bold text-xl">
                        ✔
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <Button type="submit" className="w-full mt-4">
              儲存
            </Button>
          </form>
        </Card>
      )}

      {/* 查看報告頁 */}
      {page === 'reports' && (
        <Card className="p-4 space-y-4">
          <h2 className="text-xl font-bold flex items-center justify-between">
            <span>報告列表</span>
            <Button
              type="button"
              onClick={() => {
                setQueryFilters({
                  process: selectedProcessFilter,
                  model: selectedModelFilter,
                  status: selectedStatusFilter,
                })
                setShowReports(true)
              }}
            >
              查詢
            </Button>
          </h2>

          {/* 篩選條件 */}
          <div className="flex gap-2">
            {/* 製程篩選 */}
            <select
              className="border p-2 rounded flex-1"
              value={selectedProcessFilter}
              onChange={(e) => setSelectedProcessFilter(e.target.value)}
            >
              <option value="">全部製程</option>
              {Array.from(new Set(processes.map((p) => p.name))).map(
                (procName) => (
                  <option key={procName} value={procName}>
                    {procName}
                  </option>
                ),
              )}
            </select>

            {/* 型號篩選 */}
            <select
              className="border p-2 rounded flex-1"
              value={selectedModelFilter}
              onChange={(e) => setSelectedModelFilter(e.target.value)}
            >
              <option value="">全部型號</option>
              {Array.from(new Set(processes.map((p) => p.model))).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            {/* 完成狀態篩選 */}
            <select
              className="border p-2 rounded flex-1"
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
            >
              <option value="">全部狀態</option>
              <option value="done">已完成</option>
              <option value="not">未完成</option>
            </select>
          </div>

          {/* 查詢後才顯示報告 */}
          {showReports && (
            <>
              {filteredReports.length === 0 && <p>尚無報告</p>}

              {filteredReports.map((r) => (
                <Card key={r.id} className="p-2 border space-y-2">
                  {editingReportId === r.id ? (
                    <>
                      <p className="font-bold">編輯：{r.id}</p>
                      <p>序號：{r.serial}</p>
                      <p>產品型號：{r.model}</p>
                      <p>製程：{r.process}</p>

                      {/* 顯示此報告應該拍的所有項目（含未拍）並提供重新拍照/上傳 */}
                      {(() => {
                        const proc = processes.find(
                          (p) => p.name === r.process,
                        )
                        const allItems = proc ? proc.items : []
                        return allItems.map((item, idx) => (
                          <div
                            key={item}
                            className="flex items-center gap-2"
                          >
                            <span className="flex-1">{item}</span>

                            <Button
                              type="button"
                              onClick={() => {
                                const input = document.getElementById(
                                  `edit-capture-${r.id}-${idx}`,
                                ) as HTMLInputElement
                                input?.click()
                              }}
                              className="px-2 py-1"
                            >
                              📷 拍照
                            </Button>

                            <Button
                              type="button"
                              onClick={() => {
                                const input = document.getElementById(
                                  `edit-upload-${r.id}-${idx}`,
                                ) as HTMLInputElement
                                input?.click()
                              }}
                              className="px-2 py-1"
                            >
                              📁 上傳
                            </Button>

                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              id={`edit-capture-${r.id}-${idx}`}
                              onChange={(e) =>
                                handleEditCapture(
                                  item,
                                  e.target.files?.[0],
                                )
                              }
                            />

                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              id={`edit-upload-${r.id}-${idx}`}
                              onChange={(e) =>
                                handleEditCapture(
                                  item,
                                  e.target.files?.[0],
                                )
                              }
                            />

                            {editImages[item] || r.images[item] ? (
                              <span className="text-green-600 font-bold text-xl">
                                ✔
                              </span>
                            ) : (
                              <span className="text-gray-400 font-bold text-xl">
                                ✘
                              </span>
                            )}
                          </div>
                        ))
                      })()}

                      <div className="flex gap-2 mt-3">
                        <Button
                          className="flex-1"
                          type="button"
                          onClick={() => {
                            // 先進入「編輯預覽」而不是直接儲存
                            setEditPreviewIndex(0)
                            setShowEditPreview(true)
                          }}
                        >
                          儲存
                        </Button>

                        <Button
                          className="flex-1"
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setEditingReportId(null)
                            setEditImages(r.images || {})
                          }}
                        >
                          取消
                        </Button>
                      </div>
                    </>
                  ) : (
                    // 一般顯示模式
                    <>
                      <p>表單編號：{r.id}</p>
                      <p>序號：{r.serial}</p>
                      <p>產品型號：{r.model}</p>
                      <p>製程：{r.process}</p>

                      {(() => {
                        const proc = processes.find(
                          (p) => p.name === r.process,
                        )
                        const allItems = proc ? proc.items : []
                        return allItems.map((item) => (
                          <div
                            key={item}
                            className="flex items-center gap-2"
                          >
                            <span>{item}</span>
                            {r.images[item] ? (
                              <span className="text-green-600 font-bold text-xl">
                                ✔
                              </span>
                            ) : (
                              <span className="text-gray-400 font-bold text-xl">
                                ✘
                              </span>
                            )}
                          </div>
                        ))
                      })()}

                      <Button
                        className="mt-2"
                        type="button"
                        onClick={() => {
                          setEditingReportId(r.id)
                          setEditImages(r.images || {})
                        }}
                      >
                        編輯
                      </Button>
                    </>
                  )}
                </Card>
              ))}
            </>
          )}
        </Card>
      )}

      {/* 管理製程頁 */}
      {page === 'manage' && (
        <Card className="p-4 space-y-4">
          <h2 className="text-xl font-bold">管理製程</h2>

          <div className="space-y-4">
            {/* 製程基本資料輸入（名稱 / 代號 / 型號） */}
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Input
                  value={newProcName}
                  placeholder="製程名稱"
                  readOnly={editingIndex !== null}
                  className={editingIndex !== null ? 'bg-gray-100' : ''}
                  onChange={(e) => setNewProcName(e.target.value)}
                />
                <Input
                  value={newProcCode}
                  placeholder="製程代號"
                  readOnly={editingIndex !== null}
                  className={editingIndex !== null ? 'bg-gray-100' : ''}
                  onChange={(e) => setNewProcCode(e.target.value)}
                />
              </div>
              <Input
                value={newProcModel}
                placeholder="產品型號"
                readOnly={editingIndex !== null}
                className={editingIndex !== null ? 'bg-gray-100' : ''}
                onChange={(e) => setNewProcModel(e.target.value)}
              />
            </div>

            {/* 檢驗照片項目新增區 */}
            <div className="flex gap-2">
              <Input
                value={newItem}
                placeholder="新增檢驗照片項目"
                onChange={(e) => setNewItem(e.target.value)}
              />
              <Button type="button" onClick={addItem}>
                加入
              </Button>
            </div>

            {/* 項目列表（可刪除） */}
            {items.map((i, idx) => (
              <div
                key={idx}
                className="border p-2 rounded flex justify-between items-center"
              >
                <span>{i}</span>
                <Button
                  variant="destructive"
                  size="sm"
                  type="button"
                  onClick={() =>
                    setConfirmTarget({ type: 'item', index: idx })
                  }
                >
                  刪除
                </Button>
              </div>
            ))}

            {/* 儲存 / 更新製程 */}
            <div className="flex gap-2">
              <Button onClick={saveProcess} className="flex-1" type="button">
                {editingIndex !== null ? '更新製程' : '儲存製程'}
              </Button>
              {editingIndex !== null && (
                <Button
                  className="flex-1"
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setEditingIndex(null)
                    setNewProcName('')
                    setNewProcCode('')
                    setNewProcModel('')
                    setItems([])
                  }}
                >
                  取消編輯
                </Button>
              )}
            </div>

            {/* 已有製程列表 */}
            {processes.map((p, idx) => (
              <div key={idx} className="border p-2 rounded space-y-1">
                <div className="flex justify-between items-center">
                  <span>{`${p.name} (${p.code}) - ${
                    p.model || '無型號'
                  }`}</span>
                  <div className="flex gap-2">
                    <Button type="button" onClick={() => startEditingProcess(idx)}>
                      編輯
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() =>
                        setConfirmTarget({ type: 'process', proc: p })
                      }
                    >
                      刪除
                    </Button>
                  </div>
                </div>
                {p.items.length > 0 && (
                  <div className="ml-4 space-y-1">
                    {p.items.map((item, iidx) => (
                      <div key={iidx} className="text-sm">
                        • {item}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ⭐ 儲存前預覽 Modal（新增左右滑動） */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded shadow max-w-sm w-full max-h-[90vh] overflow-y-auto space-y-4">
            <p className="text-lg font-bold">📷 照片預覽</p>
            <p className="text-sm text-gray-600">
              可左右切換照片（依檢驗項目順序顯示）
            </p>

            {(() => {
              const items = selectedProcObj?.items || []
              if (items.length === 0) {
                return (
                  <p className="text-sm text-gray-500">目前沒有檢驗項目</p>
                )
              }

              const safeIndex = Math.min(previewIndex, items.length - 1)
              const currentItem = items[safeIndex]
              const currentImg = currentItem ? images[currentItem] : null

              return (
                <div className="space-y-2 text-center">
                  <p className="font-medium">{currentItem}</p>

                  {currentImg ? (
                    <img src={currentImg} className="w-full rounded border" />
                  ) : (
                    <p className="text-red-500 text-sm">尚未拍攝</p>
                  )}

                  <div className="flex justify-between pt-2">
                    <Button
                      type="button"
                      onClick={() =>
                        setPreviewIndex((prev) =>
                          prev - 1 < 0 ? items.length - 1 : prev - 1,
                        )
                      }
                    >
                      ⬅ 上一張
                    </Button>

                    <Button
                      type="button"
                      onClick={() =>
                        setPreviewIndex((prev) => (prev + 1) % items.length)
                      }
                    >
                      下一張 ➡
                    </Button>
                  </div>

                  <p className="text-xs text-gray-500">
                    {safeIndex + 1} / {items.length}
                  </p>
                </div>
              )
            })()}

            <div className="flex gap-2 pt-2 sticky bottom-0 bg-white pb-2">
              <Button
                className="flex-1"
                variant="secondary"
                onClick={() => setShowPreview(false)}
              >
                返回修改
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  setShowPreview(false)
                  saveReport()
                }}
              >
                確認儲存
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ⭐ 編輯儲存前預覽 Modal */}
      {showEditPreview && editingReportId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded shadow max-w-sm w-full max-h-[90vh] overflow-y-auto space-y-4">
            <p className="text-lg font-bold">📷 編輯照片預覽</p>
            {(() => {
              const report = reports.find((r) => r.id === editingReportId)
              const proc = processes.find((p) => p.name === report?.process)
              const items = proc?.items || []
              if (items.length === 0 || !report) {
                return (
                  <p className="text-sm text-gray-500">沒有可預覽的項目</p>
                )
              }
              const safeIndex = Math.min(editPreviewIndex, items.length - 1)
              const item = items[safeIndex]
              const img = editImages[item] || report.images[item]
              return (
                <div className="space-y-2 text-center">
                  <p className="font-medium">{item}</p>
                  {img ? (
                    <img src={img} className="w-full rounded border" />
                  ) : (
                    <p className="text-red-500">尚未拍攝</p>
                  )}
                  <div className="flex justify-between pt-2">
                    <Button
                      type="button"
                      onClick={() =>
                        setEditPreviewIndex((p) =>
                          p - 1 < 0 ? items.length - 1 : p - 1,
                        )
                      }
                    >
                      ⬅ 上一張
                    </Button>
                    <Button
                      type="button"
                      onClick={() =>
                        setEditPreviewIndex((p) => (p + 1) % items.length)
                      }
                    >
                      下一張 ➡
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500">
                    {safeIndex + 1} / {items.length}
                  </p>
                </div>
              )
            })()}
            <div className="flex gap-2 pt-2 sticky bottom-0 bg-white pb-2">
              <Button
                className="flex-1"
                variant="secondary"
                onClick={() => setShowEditPreview(false)}
              >
                返回修改
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  setReports((prev) =>
                    prev.map((rep) =>
                      rep.id === editingReportId
                        ? { ...rep, images: { ...editImages } }
                        : rep,
                    ),
                  )
                  setShowEditPreview(false)
                  setEditingReportId(null)
                }}
              >
                確認儲存
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 刪除確認 Modal */}
      {confirmTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded shadow w-72 space-y-4">
            <p className="text-lg font-bold">⚠ 確定要刪除？</p>
            <p className="text-sm text-gray-600">此動作無法復原。</p>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                variant="secondary"
                onClick={() => setConfirmTarget(null)}
              >
                取消
              </Button>
              <Button
                className="flex-1"
                variant="destructive"
                onClick={() => {
                  if (confirmTarget?.type === 'item')
                    removeItem(confirmTarget.index)
                  if (confirmTarget?.type === 'process')
                    removeProcess(confirmTarget.proc)
                  setConfirmTarget(null)
                }}
              >
                刪除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
