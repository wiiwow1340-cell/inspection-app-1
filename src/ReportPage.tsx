import React, { useMemo, useState } from "react";
import type { Process, Report } from "./types";

type Props = {
  Card: React.ComponentType<
    React.HTMLAttributes<HTMLDivElement> & { className?: string }
  >;
  Button: React.ComponentType<
    React.ButtonHTMLAttributes<HTMLButtonElement> & {
      variant?: string;
      size?: string;
      className?: string;
    }
  >;
  StatusIcon: React.ComponentType<{
    kind: "ok" | "ng" | "na";
    className?: string;
    title?: string;
  }>;

  processes: Process[];
  reports: Report[];
  filteredReports?: Report[];
  selectedProcessFilter?: string;
  setSelectedProcessFilter?: React.Dispatch<React.SetStateAction<string>>;
  selectedModelFilter?: string;
  setSelectedModelFilter?: React.Dispatch<React.SetStateAction<string>>;
  selectedStatusFilter?: string;
  setSelectedStatusFilter?: React.Dispatch<React.SetStateAction<string>>;
  setQueryFilters?: React.Dispatch<
    React.SetStateAction<{ process: string; model: string; status: string }>
  >;

  fetchReportsFromDB: () => Promise<Report[]>;
  setReports: React.Dispatch<React.SetStateAction<Report[]>>;

  expandedReportId: string | null;
  toggleExpandReport: (id: string) => void;
  editingReportId: string | null;
  toggleEditReport: (id: string) => void;

  editImages: Record<string, string[]>;
  editNA: Record<string, boolean>;
  setEditNA: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  handleEditCapture: (item: string, files?: FileList | File[]) => void;

  setSignedImg: React.Dispatch<React.SetStateAction<string[]>>;
  setEditPreviewIndex: React.Dispatch<React.SetStateAction<number>>;
  setShowEditPreview: React.Dispatch<React.SetStateAction<boolean>>;

  NA_SENTINEL: string;
};

const ReportPage: React.FC<Props> = ({
  Card,
  Button,
  StatusIcon,

  processes,
  reports,

  fetchReportsFromDB,
  setReports,

  expandedReportId,
  toggleExpandReport,
  editingReportId,
  toggleEditReport,

  editImages,
  editNA,
  setEditNA,
  handleEditCapture,

  setSignedImg,
  setEditPreviewIndex,
  setShowEditPreview,

  NA_SENTINEL,
}) => {

  // UI 篩選條件（尚未套用）
  const [processFilter, setProcessFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "done" | "not">("");

  // 已套用的查詢條件（按「查詢」才生效）
  const [appliedProcess, setAppliedProcess] = useState("");
  const [appliedModel, setAppliedModel] = useState("");
  const [appliedStatus, setAppliedStatus] = useState<"" | "done" | "not">("");
  const [hasQueried, setHasQueried] = useState(false);

  // ===== 篩選後報告（本頁自行計算）=====
  const filteredReports = useMemo(() => {
    if (!hasQueried) return [];
    return reports.filter((r) => {
      if (appliedProcess && r.process !== appliedProcess) return false;
      if (appliedModel && r.model !== appliedModel) return false;

      if (appliedStatus) {
        const expected = r.expected_items || [];
        const isItemNA = (item: string) => r.images?.[item] === NA_SENTINEL;
        const hasItemImage = (item: string) => {
          const value = r.images?.[item];
          if (!value || value === NA_SENTINEL) return false;
          return Array.isArray(value) ? value.length > 0 : true;
        };
        const required = expected.filter((it: string) => !isItemNA(it));

        if (appliedStatus === "done") {
          if (required.length === 0) return true;
          if (!required.every((item: string) => hasItemImage(item)))
            return false;
        }

        if (appliedStatus === "not") {
          if (required.length === 0) return false;
          if (!required.some((item: string) => !hasItemImage(item)))
            return false;
        }
      }

      return true;
    });
  }, [reports, appliedProcess, appliedModel, appliedStatus, hasQueried, NA_SENTINEL]);

  return (
    <Card className="space-y-4 p-3 sm:p-4">
      <h2 className="text-xl font-bold text-slate-900 flex items-center justify-between">
        <span>報告列表</span>
        <Button
          type="button"
          onClick={async () => {
            const fresh = await fetchReportsFromDB();
            setReports(fresh);
            setAppliedProcess(processFilter);
            setAppliedModel(modelFilter);
            setAppliedStatus(statusFilter);
            setHasQueried(true);
          }}
        >
          查詢
        </Button>
      </h2>

      {/* ===== 篩選列 ===== */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          className="border border-slate-200 bg-white text-slate-900 p-2 rounded w-full sm:flex-1 min-w-0 focus-visible:outline-none focus-visible:border-blue-500"
          value={processFilter}
          onChange={(e) => setProcessFilter(e.target.value)}
        >
          <option value="">全部製程</option>
          {Array.from(new Set(processes.map((p) => p.name))).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <select
          className="border border-slate-200 bg-white text-slate-900 p-2 rounded w-full sm:flex-1 min-w-0 focus-visible:outline-none focus-visible:border-blue-500"
          value={modelFilter}
          onChange={(e) => setModelFilter(e.target.value)}
        >
          <option value="">全部型號</option>
          {Array.from(new Set(processes.map((p) => p.model))).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <select
          className="border border-slate-200 bg-white text-slate-900 p-2 rounded w-full sm:flex-1 min-w-0 focus-visible:outline-none focus-visible:border-blue-500"
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as "" | "done" | "not")
          }
        >
          <option value="">全部狀態</option>
          <option value="done">已完成</option>
          <option value="not">未完成</option>
        </select>
      </div>

      {filteredReports.length === 0 && <p>尚無報告</p>}

      {filteredReports.length > 0 && (
        <div className="space-y-3">
          {filteredReports.map((r) => {
            const expected = r.expected_items || [];
            const hasItemImage = (item: string) => {
              const value = r.images?.[item];
              if (!value || value === NA_SENTINEL) return false;
              return Array.isArray(value) ? value.length > 0 : true;
            };
            const isDone =
              expected.length > 0 &&
              expected.every(
                (item: string) =>
                  r.images?.[item] === NA_SENTINEL || hasItemImage(item)
              );
            const isOpen = expandedReportId === r.id;

            return (
              <div key={r.id} className="border border-slate-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  className="w-full text-left p-3 bg-white"
                  onClick={() => toggleExpandReport(r.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <span className="text-slate-500 mt-0.5">
                        {isOpen ? "▼" : "▶"}
                      </span>
                      <div className="font-semibold break-all">{r.id}</div>
                    </div>
                    <Button
                      size="sm"
                      type="button"
                      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                        e.stopPropagation();
                        toggleEditReport(r.id);
                      }}
                    >
                      {editingReportId === r.id ? "編輯中" : "編輯"}
                    </Button>
                  </div>

                  <div className="mt-2 space-y-1 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate">製程名稱：{r.process}</div>
                      {isDone ? (
                        <span className="text-green-600">已完成</span>
                      ) : (
                        <span className="text-slate-600">未完成</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm text-slate-600">
                      <div className="truncate">型號：{r.model}</div>
                      <div className="truncate">序號：{r.serial}</div>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="bg-slate-50 p-3">
                    {editingReportId === r.id ? (
                      <div className="space-y-2">
                        {(r.expected_items || []).map((item: string, idx: number) => (
                          <div key={item} className="flex items-center gap-1.5 sm:gap-2">
                            <span className="flex-1">{item}</span>

                            <Button
                              type="button"
                              className="px-2 py-1 text-xs whitespace-nowrap"
                              onClick={(
                                e: React.MouseEvent<HTMLButtonElement>
                              ) => {
                                e.stopPropagation();
                                const input = document.getElementById(
                                  `edit-capture-${r.id}-${idx}`
                                ) as HTMLInputElement;
                                input?.click();
                              }}
                            >
                              拍照
                            </Button>

                            <Button
                              type="button"
                              className="px-2 py-1 text-xs whitespace-nowrap"
                              onClick={(
                                e: React.MouseEvent<HTMLButtonElement>
                              ) => {
                                e.stopPropagation();
                                const input = document.getElementById(
                                  `edit-upload-${r.id}-${idx}`
                                ) as HTMLInputElement;
                                input?.click();
                              }}
                            >
                              上傳
                            </Button>

                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              id={`edit-capture-${r.id}-${idx}`}
                              onChange={(e) =>
                                {
                                  handleEditCapture(
                                    item,
                                    e.target.files || undefined
                                  );
                                  e.currentTarget.value = "";
                                }
                              }
                            />

                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              id={`edit-upload-${r.id}-${idx}`}
                              multiple
                              onChange={(e) =>
                                {
                                  handleEditCapture(
                                    item,
                                    e.target.files || undefined
                                  );
                                  e.currentTarget.value = "";
                                }
                              }
                            />

                            {editNA[item] ? (
                              <button
                                type="button"
                                className="w-8 h-8 inline-flex items-center justify-center text-slate-600"
                                onClick={() =>
                                  setEditNA((prev) => {
                                    const next = { ...prev };
                                    delete next[item];
                                    return next;
                                  })
                                }
                              >
                                <StatusIcon kind="na" />
                              </button>
                            ) : (editImages[item]?.length || 0) > 0 ||
                              (Array.isArray(r.images[item])
                                ? r.images[item].length > 0
                                : !!r.images[item] && r.images[item] !== NA_SENTINEL) ? (
                              <button
                                type="button"
                                className="w-8 h-8 inline-flex items-center justify-center text-green-600"
                                onClick={() =>
                                  setEditNA((prev) => ({ ...prev, [item]: true }))
                                }
                              >
                                <StatusIcon kind="ok" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="w-8 h-8 inline-flex items-center justify-center text-slate-400"
                                onClick={() =>
                                  setEditNA((prev) => ({ ...prev, [item]: true }))
                                }
                              >
                                <StatusIcon kind="ng" />
                              </button>
                              )}
                          </div>
                        ))}

                        <div className="flex gap-2 mt-3">
                          <Button
                            className="flex-1"
                            type="button"
                            onClick={() => {
                              setSignedImg([]);
                              setEditPreviewIndex(0);
                              setShowEditPreview(true);
                            }}
                          >
                            確認
                          </Button>

                          <Button
                            className="flex-1"
                            type="button"
                            variant="secondary"
                            onClick={() => toggleEditReport(r.id)}
                          >
                            取消
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(r.expected_items || []).map((item: string) => {
                          const v = r.images?.[item];
                          const isNA = v === NA_SENTINEL;
                          const hasImg = Array.isArray(v)
                            ? v.length > 0
                            : !!v && v !== NA_SENTINEL;
                          return (
                            <div key={item} className="flex items-center gap-2">
                              <span className="flex-1">{item}</span>
                              {isNA ? (
                                <span className="text-slate-600">
                                  <StatusIcon kind="na" />
                                </span>
                              ) : hasImg ? (
                                <span className="text-green-600">
                                  <StatusIcon kind="ok" />
                                </span>
                              ) : (
                                <span className="text-slate-400">
                                  <StatusIcon kind="ng" />
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default ReportPage;
