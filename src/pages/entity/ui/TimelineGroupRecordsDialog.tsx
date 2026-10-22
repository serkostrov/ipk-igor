import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { cn } from "@/shared/lib/cn";
import { formatDateDisplay } from "@/shared/lib/format-date";
import { pluralRu } from "@/shared/lib/plural";
import {
  formatRecordFieldValue,
  getEntityTimelineDates,
  getEntityTimelineSetup,
  resolveRelationRecordLabel,
  useEntityValueContext,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";
import { EntityRecordDialog } from "./EntityRecordDialog";

type TimelineGroupRecordsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: Entity;
  records: readonly EntityRecord[];
  /** Group / article label from the chart row. */
  groupLabel: string;
  /** Formatted cell value (sum / count) that was clicked. */
  cellLabel?: string | null;
};

/**
 * Compact list of operations that make up a timeline group cell value.
 * Click a row to open the usual record dialog.
 */
export function TimelineGroupRecordsDialog({
  open,
  onOpenChange,
  entity,
  records,
  groupLabel,
  cellLabel,
}: TimelineGroupRecordsDialogProps) {
  const valueContext = useEntityValueContext();
  const setup = useMemo(() => getEntityTimelineSetup(entity), [entity]);
  const [editing, setEditing] = useState<EntityRecord | null>(null);

  const rows = useMemo(() => {
    return records.map((record) => {
      const title =
        resolveRelationRecordLabel(entity, record.id) ?? "Без названия";
      const amount =
        setup?.labelField != null
          ? formatRecordFieldValue(
              valueContext,
              entity,
              record,
              setup.labelField,
            )
          : null;
      const dates = setup ? getEntityTimelineDates(setup, record) : null;
      const period =
        dates == null
          ? null
          : dates.start === dates.end
            ? formatDateDisplay(dates.start)
            : `${formatDateDisplay(dates.start)} — ${formatDateDisplay(dates.end)}`;
      return { record, title, amount, period };
    });
  }, [entity, records, setup, valueContext]);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) setEditing(null);
          onOpenChange(next);
        }}
      >
        <DialogContent className="flex max-h-[min(90vh,36rem)] w-full min-w-[min(100%,22rem)] max-w-[min(92vw,28rem)] flex-col gap-3 overflow-hidden sm:max-w-[min(92vw,28rem)]">
          <DialogHeader className="shrink-0 gap-1 pr-6">
            <DialogTitle className="truncate">{groupLabel}</DialogTitle>
            <DialogDescription className="truncate">
              {cellLabel
                ? `${cellLabel} · ${records.length} ${pluralRu(records.length, "запись", "записи", "записей")}`
                : `${records.length} ${pluralRu(records.length, "запись", "записи", "записей")}`}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
            {rows.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Нет записей за этот период
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map(({ record, title, amount, period }) => (
                  <li key={record.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                      )}
                      onClick={() => setEditing(record)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {title}
                        </span>
                        {period ? (
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground tabular-nums">
                            {period}
                          </span>
                        ) : null}
                      </span>
                      {amount && amount !== "—" ? (
                        <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                          {amount}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <EntityRecordDialog
        open={editing != null}
        onOpenChange={(next) => {
          if (!next) setEditing(null);
        }}
        entity={entity}
        record={editing}
      />
    </>
  );
}
