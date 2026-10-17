import { useState } from "react";
import { ArrowRight, EyeOff, GitBranch, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  createAutomationStageTransitionId,
  emptyAutomationConditions,
  type AutomationStageTransition,
} from "@/entities/automation";
import type { Entity } from "@/entities/entity";
import { cn } from "@/shared/lib/cn";
import { ConditionGroupBuilder } from "./ConditionGroupBuilder";

type StageOption = { id: string; name: string; color?: string };

type StageTransitionInspectorProps = {
  fromStage: StageOption;
  toStage: StageOption;
  stages: StageOption[];
  entity: Entity;
  value: AutomationStageTransition | null;
  onSave: (transition: AutomationStageTransition) => void | Promise<void>;
  onClear: () => void | Promise<void>;
  onClose: () => void;
  /** Hide the map link between stages (line stays restorable on canvas). */
  onHideLink?: () => void;
  /** Label for applying changes to the parent draft. */
  commitLabel?: string;
};

function StageChip({
  name,
  color,
  className,
}: {
  name: string;
  color?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2.5 shadow-xs",
        className,
      )}
    >
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color || "var(--primary)" }}
      />
      <span className="min-w-0 truncate text-sm font-medium">{name}</span>
    </div>
  );
}

/** Vertical stem + split into two branches (тогда / иначе). */
function BranchFork({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("relative mx-auto h-10 w-full max-w-[20rem]", className)}
    >
      <svg
        viewBox="0 0 200 40"
        className="h-full w-full overflow-visible text-border"
        preserveAspectRatio="none"
      >
        <path
          d="M100 0 V14 M100 14 H36 M100 14 H164 M36 14 V40 M164 14 V40"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function StageTransitionInspector({
  fromStage,
  toStage,
  stages,
  entity,
  value,
  onSave,
  onClear,
  onClose,
  onHideLink,
  commitLabel = "Применить",
}: StageTransitionInspectorProps) {
  const [draft, setDraft] = useState<AutomationStageTransition>(
    () =>
      value ?? {
        id: createAutomationStageTransitionId(),
        fromOptionId: fromStage.id,
        toOptionId: toStage.id,
        conditions: emptyAutomationConditions(),
        elseOptionId: "",
      },
  );
  const [saving, setSaving] = useState(false);

  const elseStages = stages.filter(
    (stage) => stage.id !== fromStage.id && stage.id !== toStage.id,
  );
  const elseStage = stages.find((stage) => stage.id === draft.elseOptionId);
  const hasRules = draft.conditions.rules.length > 0;

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      await onSave({
        ...draft,
        fromOptionId: fromStage.id,
        toOptionId: toStage.id,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (saving) return;
    setSaving(true);
    try {
      await onClear();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <GitBranch className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Условие перехода</h3>
              <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <span className="truncate font-medium text-foreground/80">
                  {fromStage.name}
                </span>
                <ArrowRight className="size-3 shrink-0 opacity-60" />
                <span className="truncate font-medium text-foreground/80">
                  {toStage.name}
                </span>
              </p>
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={onClose}
        >
          Закрыть
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-auto pt-4">
        <div className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            При переходе с «{fromStage.name}» на «{toStage.name}» проверяются
            условия. Если выполнены — запись идёт дальше; иначе — на другую
            стадию или переход запрещается.
          </p>
        </div>

        <div className="flex flex-col gap-1.5 pt-3">
          <Label className="text-xs font-medium">Если выполняется</Label>
          <ConditionGroupBuilder
            entity={entity}
            value={draft.conditions}
            onChange={(conditions) =>
              setDraft((prev) => ({ ...prev, conditions }))
            }
          />
        </div>

        <BranchFork className="mt-1" />

        <div className="grid grid-cols-2 gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <span
                className="size-1.5 rounded-full bg-emerald-500"
                aria-hidden
              />
              <Label className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                Тогда
              </Label>
            </div>
            <StageChip name={toStage.name} color={toStage.color} />
            <p className="text-[10px] leading-snug text-muted-foreground">
              Переход разрешён
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <span
                className="size-1.5 rounded-full bg-amber-500"
                aria-hidden
              />
              <Label className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Иначе
              </Label>
            </div>
            <Select
              value={draft.elseOptionId || "__block__"}
              onValueChange={(next) => {
                if (next == null) return;
                const value = String(next);
                setDraft((prev) => ({
                  ...prev,
                  elseOptionId: value === "__block__" ? "" : value,
                }));
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {draft.elseOptionId ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            elseStage?.color || "var(--muted-foreground)",
                        }}
                      />
                      <span className="truncate">
                        {elseStage?.name || "Другая стадия"}
                      </span>
                    </span>
                  ) : (
                    "Запретить переход"
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__block__">Запретить переход</SelectItem>
                {elseStages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] leading-snug text-muted-foreground">
              {draft.elseOptionId
                ? "Запись будет перенаправлена на выбранную стадию"
                : "Пользователь останется на текущей стадии"}
            </p>
          </div>
        </div>

        {!hasRules ? (
          <p className="mt-3 rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
            Добавьте хотя бы одно условие — иначе переход всегда разрешён
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button
          type="button"
          size="sm"
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {commitLabel}
        </Button>
        {onHideLink ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={onHideLink}
          >
            <EyeOff className="size-3.5" />
            Скрыть связь
          </Button>
        ) : null}
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={saving}
            onClick={() => void handleClear()}
          >
            <Trash2 className="size-3.5" />
            Убрать условие
          </Button>
        ) : null}
      </div>
    </div>
  );
}
