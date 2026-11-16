import { useMemo, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { formatEntityFieldFilesSummary } from "../model/field";
import { parseEntityFieldFileEntries } from "../model/types";
import type { EntityFileViewerItem } from "../lib/file-preview";
import { EntityFileViewer } from "./EntityFileViewer";

const FILE_LINK_CLASS =
  "cursor-default truncate text-sm font-medium text-primary underline-offset-2 hover:underline";

/**
 * Read-only file field: clickable summary that opens the in-app viewer.
 * Used by `RecordValue` (tasks «Для просмотра», record cards, etc.).
 */
export function RecordFileValue({
  value,
  className,
}: {
  value: string | undefined;
  className?: string;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const summary = formatEntityFieldFilesSummary(value);
  const files = useMemo((): EntityFileViewerItem[] => {
    return parseEntityFieldFileEntries(value)
      .filter((entry) => entry.kind === "file")
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        mimeType: entry.mimeType,
        size: entry.size,
        storagePath: entry.storagePath,
        dataUrl: entry.dataUrl,
      }));
  }, [value]);

  if (files.length === 0 || summary === "—") {
    return <span className={cn("text-muted-foreground/70", className)}>—</span>;
  }

  const activeId = files[0]?.id ?? null;

  return (
    <>
      <button
        type="button"
        className={cn(FILE_LINK_CLASS, "text-left", className)}
        title={summary}
        onClick={(event) => {
          event.stopPropagation();
          setViewerOpen(true);
        }}
      >
        {summary}
      </button>
      <EntityFileViewer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        files={files}
        activeId={activeId}
      />
    </>
  );
}
