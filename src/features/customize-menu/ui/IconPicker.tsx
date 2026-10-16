import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import {
  getMenuIcon,
  menuIconOptions,
  type MenuIconName,
} from "@/entities/menu";

type IconPickerProps = {
  value: MenuIconName;
  onChange: (value: MenuIconName) => void;
};

/** 3 full rows + gap + ~30% of next row so scroll is obvious. */
const ICON_PICKER_MAX_HEIGHT = "max-h-[calc(3*2rem+3*0.375rem+1rem+0.6rem)]";

export function IconPicker({ value, onChange }: IconPickerProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-6 gap-1.5 overflow-y-auto rounded-md border border-border p-2",
        ICON_PICKER_MAX_HEIGHT,
      )}
    >
      {menuIconOptions.map((name) => {
        const Icon = getMenuIcon(name);
        const isActive = name === value;

        return (
          <Button
            key={name}
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={name}
            aria-pressed={isActive}
            onClick={() => onChange(name)}
            className={cn(
              isActive &&
                "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
            )}
          >
            <Icon aria-hidden />
          </Button>
        );
      })}
    </div>
  );
}
