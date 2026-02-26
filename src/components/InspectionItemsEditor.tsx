import React, { useEffect, useRef, useState } from "react";

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
  onClearNewPhotos?: (item: string) => void;
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
  onClearNewPhotos,
  inputIdPrefix,
  getExistingCount,
  getNewCount,
  onActionClick,
  Button,
  StatusIcon,
}) => {
  const [menuItem, setMenuItem] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuItem) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuItem(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [menuItem]);

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
        const isMenuOpen = menuItem === item;

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

              <div className="relative" ref={isMenuOpen ? menuRef : null}>
                <Button
                  type="button"
                  size="sm"
                  onClick={(event) => {
                    onActionClick?.(event);
                    if (newCount > 0 && onClearNewPhotos) {
                      setMenuItem((prev) => (prev === item ? null : item));
                      return;
                    }
                    setMenuItem(null);
                    (document.getElementById(captureId) as HTMLInputElement)?.click();
                  }}
                >
                  拍照
                </Button>

                {isMenuOpen && (
                  <div
                    className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                      onClick={(event) => {
                        event.stopPropagation();
                        setMenuItem(null);
                        (document.getElementById(captureId) as HTMLInputElement)?.click();
                      }}
                    >
                      拍照
                    </button>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                      onClick={(event) => {
                        event.stopPropagation();
                        setMenuItem(null);
                        onClearNewPhotos?.(item);
                      }}
                    >
                      刪除本次照片
                    </button>
                  </div>
                )}
              </div>

              <Button
                type="button"
                size="sm"
                onClick={(event) => {
                  onActionClick?.(event);
                  setMenuItem(null);
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
                  setMenuItem(null);
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
