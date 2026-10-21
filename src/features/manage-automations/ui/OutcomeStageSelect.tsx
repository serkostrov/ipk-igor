import { ArrowRightLeft } from "lucide-react";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { cn } from "@/shared/lib/cn";

type StageOption = { id: string; name: string };

type OutcomeStageSelectProps = {
  value: string;
  stages: StageOption[];
  triggerFieldId: string;
  onChange: (stageOptionId: string) => void;
  className?: string;
  /** Compact label without the hint card chrome. */
  compact?: boolean;
};

/**
 * Per-outcome «Перейти на стадию» — writes process trigger list on complete.
 */
export function OutcomeStageSelect({
  value,
  stages,
  triggerFieldId,
  onChange,
  className,
  compact = false,
}: OutcomeStageSelectProps) {
  const stageName = stages.find((item) => item.id === value)?.name ?? "";
  const disabled = !triggerFieldId;

  const select = (
    <Select
      value={value || "__none__"}
      disabled={disabled}
      onValueChange={(next) => {
        if (next == null) return;
        const raw = String(next);
        onChange(raw === "__none__" ? "" : raw);
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue>
          {stageName ||
            (triggerFieldId ? "Не менять стадию" : "Нет поля стадии")}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Не менять стадию</SelectItem>
        {stages.map((stage) => (
          <SelectItem key={stage.id} value={stage.id}>
            {stage.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (compact) {
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <Label className="text-xs font-medium text-muted-foreground">
          Перейти на стадию
        </Label>
        {select}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-md border border-border/70 bg-background p-2.5",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
          <ArrowRightLeft className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">Перейти на стадию</p>
          <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
            После завершения задания запись сразу окажется на выбранной стадии
          </p>
          <div className="mt-2">{select}</div>
        </div>
      </div>
    </div>
  );
}
