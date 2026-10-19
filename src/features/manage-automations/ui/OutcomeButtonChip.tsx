import { useState } from "react";
import { Check, Pencil, Plus } from "lucide-react";
import {
  automationOutcomeChipStyle,
  type AutomationOutcome,
} from "@/entities/automation";
import {
  DEFAULT_ENTITY_LIST_COLORS,
  normalizeListColor,
} from "@/entities/entity";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { cn } from "@/shared/lib/cn";

type OutcomeButtonChipProps = {
  outcome: AutomationOutcome;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Pick<AutomationOutcome, "label" | "color">) => void;
};

/**
 * Compact outcome chip: click selects; pencil opens rename + color.
 */
export function OutcomeButtonChip({
  outcome,
  selected,
  onSelect,
  onChange,
}: OutcomeButtonChipProps) {
  const [open, setOpen] = useState(false);
  const color = outcome.color ? normalizeListColor(outcome.color) : null;
  const customSelected =
    color != null &&
    !(DEFAULT_ENTITY_LIST_COLORS as readonly string[]).includes(color);

  return (
    <div
      className={cn(
        "group inline-flex h-8 max-w-full items-stretch overflow-hidden rounded-md border text-xs font-medium transition-colors",
        !color &&
          (selected
            ? "border-primary/40 bg-primary/10 text-foreground ring-1 ring-primary/25"
            : "border-border/70 bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground"),
      )}
      style={automationOutcomeChipStyle(color, selected)}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 text-left"
        onClick={onSelect}
      >
        <span
          className={cn(
            "size-2 shrink-0 rounded-full border border-black/10",
            !color && "bg-muted-foreground/35",
          )}
          style={color ? { backgroundColor: color } : undefined}
          aria-hidden
        />
        <span className="min-w-0 truncate">
          {outcome.label.trim() || "Без названия"}
        </span>
      </button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className={cn(
                "flex size-8 shrink-0 items-center justify-center border-l border-inherit text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground",
                open && "bg-background/70 text-foreground",
              )}
              aria-label="Название и цвет кнопки"
              onClick={(event) => {
                event.stopPropagation();
                onSelect();
              }}
            />
          }
        >
          <Pencil className="size-3" />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-64 gap-3 p-3"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor={`outcome-label-${outcome.id}`}
              className="text-[11px] font-medium text-muted-foreground"
            >
              Название
            </Label>
            <Input
              id={`outcome-label-${outcome.id}`}
              value={outcome.label}
              placeholder="Да / Нет / Готово"
              className="h-8"
              autoFocus
              onChange={(event) =>
                onChange({ label: event.target.value, color: outcome.color })
              }
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">
              Цвет
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                title="По умолчанию"
                aria-label="Цвет по умолчанию"
                aria-pressed={color == null}
                onClick={() => onChange({ label: outcome.label, color: null })}
                className={cn(
                  "relative size-5 shrink-0 rounded-full border border-border bg-muted shadow-xs transition-transform hover:scale-110",
                  color == null && "outline-2 outline-offset-1 outline-ring",
                )}
              />
              {DEFAULT_ENTITY_LIST_COLORS.map((swatch) => {
                const isSelected = color === swatch;
                return (
                  <button
                    key={swatch}
                    type="button"
                    title={swatch}
                    aria-label={`Цвет ${swatch}`}
                    aria-pressed={isSelected}
                    onClick={() =>
                      onChange({ label: outcome.label, color: swatch })
                    }
                    className={cn(
                      "relative size-5 shrink-0 rounded-full border border-black/10 shadow-xs transition-transform hover:scale-110",
                      isSelected && "outline-2 outline-offset-1 outline-ring",
                    )}
                    style={{ backgroundColor: swatch }}
                  >
                    {isSelected ? (
                      <Check
                        className="absolute inset-0 m-auto size-2.5 text-white drop-shadow"
                        aria-hidden
                      />
                    ) : null}
                  </button>
                );
              })}
              <label
                title="Свой цвет"
                aria-label="Свой цвет"
                className={cn(
                  "relative size-5 shrink-0 cursor-pointer rounded-full border border-border shadow-xs transition-transform hover:scale-110",
                  customSelected && "outline-2 outline-offset-1 outline-ring",
                )}
                style={
                  customSelected && color
                    ? { backgroundColor: color }
                    : {
                        background:
                          "conic-gradient(from 90deg, #ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ef4444)",
                      }
                }
              >
                <input
                  type="color"
                  value={color ?? "#3b82f6"}
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(event) =>
                    onChange({
                      label: outcome.label,
                      color: normalizeListColor(event.target.value),
                    })
                  }
                />
                {customSelected ? (
                  <Check
                    className="pointer-events-none absolute inset-0 m-auto size-2.5 text-white drop-shadow"
                    aria-hidden
                  />
                ) : (
                  <Plus
                    className="pointer-events-none absolute inset-0 m-auto size-2.5 text-white drop-shadow"
                    aria-hidden
                  />
                )}
              </label>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
