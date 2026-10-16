import { useState } from "react";
import { ChevronDown, Timer } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import type { Entity } from "@/entities/entity";
import { EntityTimeTrackingDialog } from "./EntityTimeTrackingDialog";

function MenuBadge({ children }: { children: string | number }) {
  return (
    <span className="ml-auto rounded-md bg-muted px-1.5 text-[11px] font-medium text-muted-foreground tabular-nums">
      {children}
    </span>
  );
}

/** Record-work settings of an entity (time tracking and future tools). */
export function EntityBehaviorMenu({
  entity,
  disabled = false,
}: {
  entity: Entity;
  disabled?: boolean;
}) {
  const [timeTrackingOpen, setTimeTrackingOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
            />
          }
        >
          Работа с записями
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setTimeTrackingOpen(true)}>
            <Timer />
            Учёт времени
            {entity.timeTracking ? <MenuBadge>вкл.</MenuBadge> : null}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EntityTimeTrackingDialog
        open={timeTrackingOpen}
        onOpenChange={setTimeTrackingOpen}
        entity={entity}
      />
    </>
  );
}
