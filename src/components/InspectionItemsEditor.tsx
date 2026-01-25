import React from "react";

type ButtonComponent = React.ComponentType<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
    className?: string;
  }
>;

type StatusIconComponent = React.ComponentType<{
  kind: "ok" | "ng" | "na";
  className?: string;
  title?: string;
}>;

type Props = {
  items: string[];
  images: Record<string, string[]>;
  naState: Record<string, boolean>;
  onSetNA: (item: string) => void;
  onClearNA: (item: string) => void;
  onCapture: (item: string, files: FileList | File[] | undefined) => void;
  inputIdPrefix: string;
  getExistingCount?: (item: string) => number;
  getNewCount?: (item: string) => number;
  onActionClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  Button: ButtonComponent;
  StatusIcon: StatusIconComponent;
};

const InspectionItemsEditor: React.FC<Props> = ({
  items,
  images,
  naState,
  onSetNA,
  onClearNA,
  onCapture,
  inputIdPrefix,
  getExistingCount,
  getNewCount,
  onActionClick,
  Button,
  StatusIcon,
}) => {
  const resolveNewCount = (item: string) =>
    getNewCount ? getNewCount(item) : images[item]?.length || 0;
  const resolveExistingCount = (item: string) =>
    getExistingCount ? getExistingCount(item) : 0;

  return (
    <div className="space-y-2 mt-2">
      {items.map((item, idx) => {
        const existingCount = resolveExistingCount(item);
        const newCount = resolveNewCount(item);
        const total = existingCount + newCount;
        const isNA = !!naState[item];
        const statusKind: "ok" | "ng" | "na" = isNA
          ? "na"
          : total > 0
          ? "ok"
          : "ng";
        const statusColor = isNA
          ? "text-slate-600"
          : total > 0
          ? "text-green-600"
          : "text-slate-400";
        const captureId = `${inputIdPrefix}-capture-${idx}`;
        const uploadId = `${inputIdPrefix}-upload-${idx}`;

        return (
          <div
            key={`${item}-${idx}`}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
          >
            <span className="min-w-0 break-words">{item}</span>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-slate-500 w-6 text-right tabular-nums">
                {total}
              </span>

              <Button
                type="button"
                size="sm"
                onClick={(event) => {
                  onActionClick?.(event);
                  (document.getElementById(captureId) as HTMLInputElement)?.click();
                }}
              >
                拍照
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={(event) => {
                  onActionClick?.(event);
                  (document.getElementById(uploadId) as HTMLInputElement)?.click();
                }}
              >
                上傳
              </Button>

              <button
                type="button"
                className={`w-8 h-8 inline-flex items-center justify-center ${statusColor}`}
                onClick={(event) => {
                  onActionClick?.(event);
                  if (isNA) {
                    onClearNA(item);
                  } else {
                    onSetNA(item);
                  }
                }}
              >
                <StatusIcon kind={statusKind} />
              </button>
            </div>

            <input
              type="file"
              accept="image/*"
              capture="environment"
              id={captureId}
              className="hidden"
              onChange={(e) => {
                onCapture(item, e.target.files || undefined);
                e.currentTarget.value = "";
              }}
            />
            <input
              type="file"
              accept="image/*"
              id={uploadId}
              className="hidden"
              multiple
              onChange={(e) => {
                onCapture(item, e.target.files || undefined);
                e.currentTarget.value = "";
              }}
            />
          </div>
        );
      })}
    </div>
  );
};

export default InspectionItemsEditor;
