import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { EntityRecordScope } from "./use-entity-record-scope";

/** Toggle for records in «Скрывать по умолчанию» list options. */
export function HiddenRecordsBar({ scope }: { scope: EntityRecordScope }) {
  if (scope.hiddenCount === 0) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-mr-2 h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
      aria-pressed={scope.showHidden}
      onClick={() => scope.setShowHidden(!scope.showHidden)}
    >
      {scope.showHidden ? (
        <EyeOff className="size-3.5" />
      ) : (
        <Eye className="size-3.5" />
      )}
      {scope.showHidden ? "Убрать скрытые" : "Показать скрытые"}
      <span className="tabular-nums text-muted-foreground/70">
        · {scope.hiddenCount}
      </span>
    </Button>
  );
}
