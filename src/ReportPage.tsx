
import React from "react";

type ReportPageProps = {
  Card: any;
  Button: any;
  StatusIcon: any;

  processes: any[];
  filteredReports: any[];
  showReports: boolean;

  selectedProcessFilter: string;
  setSelectedProcessFilter: (v: string) => void;
  selectedModelFilter: string;
  setSelectedModelFilter: (v: string) => void;
  selectedStatusFilter: string;
  setSelectedStatusFilter: (v: string) => void;

  fetchReportsFromDB: () => Promise<any[]>;
  setReports: (r: any[]) => void;
  setQueryFilters: (q: any) => void;
  setShowReports: (v: boolean) => void;

  expandedReportId: string | null;
  toggleExpandReport: (id: string) => void;
  editingReportId: string | null;
  toggleEditReport: (id: string) => void;

  editImages: Record<string, any>;
  editNA: Record<string, boolean>;
  setEditNA: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  handleEditCapture: (item: string, file?: File) => void;

  setSignedImg: (v: string) => void;
  setEditPreviewIndex: (v: number) => void;
  setShowEditPreview: (v: boolean) => void;

  NA_SENTINEL: string;
};

export default function ReportPage(props: ReportPageProps) {
  const {
    Card,
    Button,
    StatusIcon,
    processes,
    filteredReports,
    showReports,
    selectedProcessFilter,
    setSelectedProcessFilter,
    selectedModelFilter,
    setSelectedModelFilter,
    selectedStatusFilter,
    setSelectedStatusFilter,
    fetchReportsFromDB,
    setReports,
    setQueryFilters,
    setShowReports,
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
  } = props;

  return (
    <Card className="p-4 space-y-4">
      <h2 className="text-xl font-bold flex items-center justify-between">
        <span>報告列表</span>
        <Button
          type="button"
          onClick={async () => {
            const freshReports = await fetchReportsFromDB();
            setReports(freshReports);
            setQueryFilters({
              process: selectedProcessFilter,
              model: selectedModelFilter,
              status: selectedStatusFilter,
            });
            setShowReports(true);
          }}
        >
          查詢
        </Button>
      </h2>

      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          className="border p-2 rounded w-full sm:flex-1 min-w-0"
          value={selectedProcessFilter}
          onChange={(e) => setSelectedProcessFilter(e.target.value)}
        >
          <option value="">全部製程</option>
          {Array.from(new Set(processes.map((p) => p.name))).map((procName) => (
            <option key={procName} value={procName}>
              {procName}
            </option>
          ))}
        </select>

        <select
          className="border p-2 rounded w-full sm:flex-1 min-w-0"
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

      {showReports && (
        <>
          {filteredReports.length === 0 && <p>尚無報告</p>}

          {filteredReports.length > 0 && (
            <div className="sm:hidden space-y-3">
              {filteredReports.map((r: any) => {
                const expected = r.expected_items || [];
                const isDone =
                  expected.length > 0 &&
                  expected.every(
                    (item: string) =>
                      r.images?.[item] === NA_SENTINEL ||
                      !!r.images?.[item]
                  );
                const isOpen = expandedReportId === r.id;

                return (
                  <div key={r.id} className="border rounded-lg overflow-hidden">
                    <button
                      type="button"
                      className="w-full text-left p-3 bg-white"
                      onClick={() => toggleExpandReport(r.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold break-all">{r.id}</div>
                        <StatusIcon
                          kind={isDone ? "ok" : "ng"}
                          title={isDone ? "已完成" : "未完成"}
                        />
                      </div>
                      <div className="text-sm text-gray-500">
                        {r.model} / {r.process}
                      </div>
                    </button>

                    {isOpen && (
                      <div className="p-3 border-t space-y-1 text-sm">
                        {expected.map((item: string) => {
                          const v = r.images?.[item];
                          const kind =
                            v === NA_SENTINEL ? "na" : v ? "ok" : "ng";
                          return (
                            <div key={item} className="flex items-center gap-2">
                              <span className="flex-1 break-all">{item}</span>
                              <StatusIcon kind={kind} />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
