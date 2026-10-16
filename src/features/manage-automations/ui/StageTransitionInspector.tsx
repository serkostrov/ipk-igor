import { useState } from "react";
import { ArrowRight, GitBranch, Trash2 } from "lucide-react";
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
};

export function StageTransitionInspector({
  fromStage,
  toStage,
  stages,
  entity,
  value,
  onSave,
  onClear,
  onClose,
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
  const elseName =
    stages.find((stage) => stage.id === draft.elseOptionId)?.name ?? "";
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

      <div className="min-h-0 flex-1 space-y-4 overflow-auto pt-4">
        <div className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            При переходе записи с «{fromStage.name}» на «{toStage.name}»
            проверяются условия ниже. Если они выполнены — запись идёт дальше;
            иначе — на другую стадию или переход запрещается.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">Если выполняется</Label>
          <ConditionGroupBuilder
            entity={entity}
            value={draft.conditions}
            onChange={(conditions) =>
              setDraft((prev) => ({ ...prev, conditions }))
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">Тогда</Label>
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2.5">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: toStage.color || "var(--primary)" }}
            />
            <span className="text-sm font-medium">{toStage.name}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">Иначе</Label>
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
                {draft.elseOptionId
                  ? elseName || "Другая стадия"
                  : "Запретить переход"}
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
              : "Пользователь увидит предупреждение и останется на текущей стадии"}
          </p>
        </div>

        {!hasRules ? (
          <p className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
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
          Сохранить
        </Button>
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
