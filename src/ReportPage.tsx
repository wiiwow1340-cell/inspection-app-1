import React, { useMemo } from "react";
import type { Process, Report } from "./types";
import InspectionItemsEditor from "./components/InspectionItemsEditor";

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
  processStatus: "idle" | "loading" | "ready" | "empty" | "error";
  processError: string;
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
  reportHasQueried?: boolean;
  setReportHasQueried?: React.Dispatch<React.SetStateAction<boolean>>;
  pcSelectedKey?: string | null;
  setPcSelectedKey?: React.Dispatch<React.SetStateAction<string | null>>;

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

  setEditPreviewIndex: React.Dispatch<React.SetStateAction<number>>;
  setShowEditPreview: React.Dispatch<React.SetStateAction<boolean>>;

  NA_SENTINEL: string;
};

const PROCESS_ORDER = ["水壓檢驗", "性能測試", "成品檢驗"];
const PC_TABLE_PROCESS_ORDER = ["水壓檢驗", "安規測試", "性能測試", "成品檢驗"];

const formatReportDate = (reportId?: string) => {
  if (!reportId) return null;
  const match = reportId.match(/-(\d{8})/);
  if (!match) return null;
  const raw = match[1];
  const year = raw.slice(0, 4);
  const month = raw.slice(4, 6);
  const day = raw.slice(6, 8);
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
};

const isReportDone = (report: Report, naSentinel: string) => {
  const expected = report.expected_items || [];
  if (expected.length === 0) return false;
  const hasItemImage = (item: string) => {
    const value = report.images?.[item];
    if (!value || value === naSentinel) return false;
    return Array.isArray(value) ? value.length > 0 : true;
  };
  return expected.every(
    (item: string) => report.images?.[item] === naSentinel || hasItemImage(item)
  );
};

const ReportPage: React.FC<Props> = ({
  Card,
  Button,
  StatusIcon,

  processes,
  processStatus,
  processError,
  reports,
  filteredReports = [],
  selectedProcessFilter = "",
  setSelectedProcessFilter,
  selectedModelFilter = "",
  setSelectedModelFilter,
  selectedStatusFilter = "",
  setSelectedStatusFilter,
  setQueryFilters,
  reportHasQueried = false,
  setReportHasQueried,
  pcSelectedKey = null,
  setPcSelectedKey,

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

  setEditPreviewIndex,
  setShowEditPreview,

  NA_SENTINEL,
}) => {
  const isProcessReady = processStatus === "ready";
  const isProcessLoading = processStatus === "loading";
  const isProcessEmpty = processStatus === "empty";
  const isProcessError = processStatus === "error";
  const processMessage = isProcessError
    ? `製程載入失敗，無法使用查詢功能。${processError ? `（${processError}）` : ""}`
    : isProcessEmpty
    ? "資料庫目前沒有任何製程，請先建立製程。"
    : isProcessLoading
    ? "製程載入中，請稍候。"
    : "";

  const activeReports = reportHasQueried ? filteredReports : [];

  const groupedReports = useMemo(() => {
    const map = new Map<
      string,
      {
        model: string;
        serial: string;
        reports: Report[];
        processMap: Map<string, Report[]>;
      }
    >();
    activeReports.forEach((report) => {
      const key = `${report.model}__${report.serial}`;
      if (!map.has(key)) {
        map.set(key, {
          model: report.model,
          serial: report.serial,
          reports: [],
          processMap: new Map(),
        });
      }
      const entry = map.get(key)!;
      entry.reports.push(report);
      const list = entry.processMap.get(report.process) ?? [];
      list.push(report);
      entry.processMap.set(report.process, list);
    });
    const modelCollator = new Intl.Collator("en", {
      sensitivity: "base",
    });
    const serialCollator = new Intl.Collator("en", {
      numeric: true,
      sensitivity: "base",
    });
    return Array.from(map.entries())
      .map(([key, entry]) => ({
        key,
        ...entry,
      }))
      .sort((a, b) => {
        const modelCompare = modelCollator.compare(a.model, b.model);
        if (modelCompare !== 0) return modelCompare;
        return serialCollator.compare(a.serial, b.serial);
      });
  }, [activeReports]);

  const selectedGroupReports = useMemo(() => {
    if (!pcSelectedKey) return [];
    const entry = groupedReports.find((group) => group.key === pcSelectedKey);
    if (!entry) return [];
    const reportByProcess = new Map<string, Report>();
    PROCESS_ORDER.forEach((processName) => {
      const reportsForProcess = entry.processMap.get(processName) ?? [];
      if (reportsForProcess.length === 0) return;
      const latest = reportsForProcess.reduce((current, next) => {
        const currentDate = formatReportDate(current.id) ?? "";
        const nextDate = formatReportDate(next.id) ?? "";
        return nextDate > currentDate ? next : current;
      }, reportsForProcess[0]);
      reportByProcess.set(processName, latest);
    });
    return PROCESS_ORDER
      .map((processName) => reportByProcess.get(processName))
      .filter((report): report is Report => Boolean(report));
  }, [pcSelectedKey, groupedReports]);

  return (
    <Card className="p-4 space-y-4">
      <h2 className="text-xl font-bold text-slate-900 flex items-center justify-between">
        <span>報告列表</span>
        <Button
          type="button"
          size="sm"
          disabled={!isProcessReady}
          onClick={async () => {
            if (!isProcessReady) {
              alert(processMessage || "製程尚未就緒，請稍後再試。");
              return;
            }
            const fresh = await fetchReportsFromDB();
            setReports(fresh);
            setQueryFilters?.({
              process: selectedProcessFilter,
              model: selectedModelFilter,
              status: selectedStatusFilter,
            });
            setReportHasQueried?.(true);
          }}
        >
          查詢
        </Button>
      </h2>
      {!isProcessReady && (
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

      {/* ===== 篩選列 ===== */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          className="border border-slate-200 bg-white text-slate-900 p-2 rounded w-full sm:flex-1 min-w-0 focus-visible:outline-none focus-visible:border-blue-500"
          value={selectedProcessFilter}
          onChange={(e) => setSelectedProcessFilter?.(e.target.value)}
          disabled={!isProcessReady}
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
          value={selectedModelFilter}
          onChange={(e) => setSelectedModelFilter?.(e.target.value)}
          disabled={!isProcessReady}
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
          value={selectedStatusFilter}
          onChange={(e) =>
            setSelectedStatusFilter?.(e.target.value as "" | "done" | "not")
          }
          disabled={!isProcessReady}
        >
          <option value="">全部狀態</option>
          <option value="done">已完成</option>
          <option value="not">未完成</option>
        </select>
      </div>

      {reportHasQueried && activeReports.length === 0 && <p>尚無報告</p>}

      {activeReports.length > 0 && (
        <div className="hidden md:block space-y-3">
          {!pcSelectedKey ? (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="min-w-max w-full text-sm text-slate-700">
                <thead className="bg-slate-100 text-slate-700 whitespace-nowrap">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">
                      型號
                    </th>
                    <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">
                      序號
                    </th>
                    <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">
                      水壓檢驗
                    </th>
                    <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">
                      安規測試
                    </th>
                    <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">
                      性能測試
                    </th>
                    <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">
                      成品檢驗
                    </th>
                    <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groupedReports.map((group) => (
                    <tr
                      key={group.key}
                      className="border-t border-slate-200"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        {group.model}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {group.serial}
                      </td>
                      {PC_TABLE_PROCESS_ORDER.map((processName) => {
                        const reportsForProcess =
                          group.processMap.get(processName) ?? [];
                        const latestReport = reportsForProcess.reduce<
                          Report | null
                        >((current, next) => {
                          if (!current) return next;
                          const currentDate = formatReportDate(current.id) ?? "";
                          const nextDate = formatReportDate(next.id) ?? "";
                          return nextDate > currentDate ? next : current;
                        }, null);
                        const formattedDate = latestReport
                          ? formatReportDate(latestReport.id)
                          : null;
                        const reportDone = latestReport
                          ? isReportDone(latestReport, NA_SENTINEL)
                          : false;
                        return (
                          <td
                            key={processName}
                            className="px-4 py-3 whitespace-nowrap"
                          >
                            {formattedDate ? (
                              <>
                                <span className="text-xs align-middle mr-2">
                                  {reportDone ? "●" : "○"}
                                </span>
                                {formattedDate}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          type="button"
                          className="text-blue-600 hover:text-blue-700 hover:underline"
                          onClick={() => setPcSelectedKey?.(group.key)}
                        >
                          查看 / 編輯
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-3 max-w-xl w-full mx-auto">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600">
                  型號：{groupedReports.find((g) => g.key === pcSelectedKey)?.model}
                  {" ｜ "}序號：
                  {groupedReports.find((g) => g.key === pcSelectedKey)?.serial}
                </p>
                <button
                  type="button"
                  className="text-blue-600 hover:text-blue-700 hover:underline text-sm"
                  onClick={() => setPcSelectedKey?.(null)}
                >
                  返回列表
                </button>
              </div>
              {selectedGroupReports.length === 0 && (
                <p className="text-sm text-slate-500">尚無報告</p>
              )}
              {selectedGroupReports.map((r) => {
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
                const isEditing = editingReportId === r.id;
                const cardWrapperClass = isEditing
                  ? "space-y-3"
                  : "border border-slate-200 rounded-lg overflow-hidden";
                const headerClass = `w-full text-left cursor-pointer select-none ${
                  isEditing ? "px-0 py-2" : "p-3 bg-white"
                }`;
                const contentClass = isEditing ? "" : "bg-slate-50 p-3";

                return (
                  <div key={r.id} className={cardWrapperClass}>
                    <div
                      role="button"
                      aria-expanded={isOpen}
                      className={headerClass}
                      onClick={() => toggleExpandReport(r.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold break-all">{r.id}</div>
                        <Button
                          size="sm"
                          type="button"
                          onClick={(
                            e: React.MouseEvent<HTMLButtonElement>
                          ) => {
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
                    </div>

                    {isOpen && (
                      <div className={contentClass}>
                        {isEditing ? (
                          <div className="space-y-2">
                            <InspectionItemsEditor
                              items={r.expected_items || []}
                              images={editImages}
                              naState={editNA}
                              onSetNA={(item) =>
                                setEditNA((prev) => ({ ...prev, [item]: true }))
                              }
                              onClearNA={(item) =>
                                setEditNA((prev) => {
                                  const next = { ...prev };
                                  delete next[item];
                                  return next;
                                })
                              }
                              onCapture={handleEditCapture}
                              inputIdPrefix={`edit-${r.id}`}
                              getExistingCount={(item) =>
                                Array.isArray(r.images[item])
                                  ? r.images[item].length
                                  : r.images[item] &&
                                    r.images[item] !== NA_SENTINEL
                                  ? 1
                                  : 0
                              }
                              getNewCount={(item) => editImages[item]?.length || 0}
                              onActionClick={(e) => e.stopPropagation()}
                              Button={Button}
                              StatusIcon={StatusIcon}
                            />

                            <div className="flex gap-2 mt-3">
                              <Button
                                className="flex-1"
                                type="button"
                                onClick={() => {
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
                                <div
                                  key={item}
                                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
                                >
                                  <span className="min-w-0 break-words">
                                    {item}
                                  </span>
                                  {isNA ? (
                                    <span className="text-slate-600 shrink-0">
                                      <StatusIcon kind="na" />
                                    </span>
                                  ) : hasImg ? (
                                    <span className="text-green-600 shrink-0">
                                      <StatusIcon kind="ok" />
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 shrink-0">
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
        </div>
      )}

      {activeReports.length > 0 && (
        <div className="space-y-3 md:hidden">
          {activeReports.map((r) => {
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
            const isEditing = editingReportId === r.id;
            const cardWrapperClass = isEditing
              ? "space-y-3"
              : "border border-slate-200 rounded-lg overflow-hidden";
            const headerClass = `w-full text-left cursor-pointer select-none ${
              isEditing ? "px-0 py-2" : "p-3 bg-white"
            }`;
            const contentClass = isEditing ? "" : "bg-slate-50 p-3";

            return (
              <div key={r.id} className={cardWrapperClass}>
                <div
                  role="button"
                  aria-expanded={isOpen}
                  className={headerClass}
                  onClick={() => toggleExpandReport(r.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold break-all">{r.id}</div>
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
                </div>

                {isOpen && (
                  <div className={contentClass}>
                    {isEditing ? (
                      <div className="space-y-2">
                        <InspectionItemsEditor
                          items={r.expected_items || []}
                          images={editImages}
                          naState={editNA}
                          onSetNA={(item) =>
                            setEditNA((prev) => ({ ...prev, [item]: true }))
                          }
                          onClearNA={(item) =>
                            setEditNA((prev) => {
                              const next = { ...prev };
                              delete next[item];
                              return next;
                            })
                          }
                          onCapture={handleEditCapture}
                          inputIdPrefix={`edit-${r.id}`}
                          getExistingCount={(item) =>
                            Array.isArray(r.images[item])
                              ? r.images[item].length
                              : r.images[item] && r.images[item] !== NA_SENTINEL
                              ? 1
                              : 0
                          }
                          getNewCount={(item) => editImages[item]?.length || 0}
                          onActionClick={(e) => e.stopPropagation()}
                          Button={Button}
                          StatusIcon={StatusIcon}
                        />

                        <div className="flex gap-2 mt-3">
                          <Button
                            className="flex-1"
                            type="button"
                            onClick={() => {
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
                            <div
                              key={item}
                              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
                            >
                              <span className="min-w-0 break-words">{item}</span>
                              {isNA ? (
                                <span className="text-slate-600 shrink-0">
                                  <StatusIcon kind="na" />
                                </span>
                              ) : hasImg ? (
                                <span className="text-green-600 shrink-0">
                                  <StatusIcon kind="ok" />
                                </span>
                              ) : (
                                <span className="text-slate-400 shrink-0">
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
