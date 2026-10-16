import { Check, LayoutGrid, Table2 } from "lucide-react";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  ENTITY_RECORD_COLUMN_OPTIONS,
  normalizeEntityRecordColumns,
  type EntityRecordColumns,
  type EntityRecordsDisplay,
} from "@/entities/entity";
import { cn } from "@/shared/lib/cn";

const DISPLAY_OPTIONS: Array<{
  value: EntityRecordsDisplay;
  label: string;
  description: string;
  icon: typeof LayoutGrid;
}> = [
  {
    value: "cards",
    label: "Карточки",
    description: "Плитки записей",
    icon: LayoutGrid,
  },
  {
    value: "table",
    label: "Таблица",
    description: "Строки в таблице",
    icon: Table2,
  },
];

function columnLabel(value: EntityRecordColumns) {
  if (value === 1) return "1 колонка";
  if (value === 2) return "2 колонки";
  return "3 колонки";
}

type EntityRecordsDisplayFieldsProps = {
  recordsDisplay: EntityRecordsDisplay;
  recordColumns: EntityRecordColumns;
  onRecordsDisplayChange: (value: EntityRecordsDisplay) => void;
  onRecordColumnsChange: (value: EntityRecordColumns) => void;
  columnsSelectId?: string;
  hint?: string;
};

export function EntityRecordsDisplayFields({
  recordsDisplay,
  recordColumns,
  onRecordsDisplayChange,
  onRecordColumnsChange,
  columnsSelectId = "entity-record-columns",
  hint,
}: EntityRecordsDisplayFieldsProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <Label>Вид отображения</Label>
          {hint ? (
            <p className="text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {DISPLAY_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = recordsDisplay === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onRecordsDisplayChange(option.value)}
                className={cn(
                  "relative flex items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                  selected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border bg-background hover:border-foreground/20 hover:bg-muted/40",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-md",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 pr-4">
                  <span className="block truncate text-sm font-medium">
                    {option.label}
                  </span>
                  <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                    {option.description}
                  </span>
                </span>
                <span
                  className={cn(
                    "absolute top-1.5 right-1.5 flex size-3.5 items-center justify-center rounded-full border",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-transparent",
                  )}
                  aria-hidden
                >
                  <Check className="size-2.5" strokeWidth={3} />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {recordsDisplay === "cards" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={columnsSelectId}>Колонки записей</Label>
          <Select
            value={String(recordColumns)}
            onValueChange={(value) => {
              if (value == null) return;
              onRecordColumnsChange(
                normalizeEntityRecordColumns(Number(value)),
              );
            }}
          >
            <SelectTrigger id={columnsSelectId} className="w-full">
              <SelectValue>{columnLabel(recordColumns)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ENTITY_RECORD_COLUMN_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {columnLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}
