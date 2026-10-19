import { useState } from "react";
import { ArrowRight, CircleCheck, GitBranch, Trash2 } from "lucide-react";
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
import { pluralRu } from "@/shared/lib/plural";
import { ConditionGroupBuilder } from "./ConditionGroupBuilder";

type StageOption = {
  id: string;
  name: string;
  color?: string;
  final?: boolean;
};

type StageTransitionInspectorProps = {
  fromStage: StageOption;
  /** Initial «тогда» target (defaults to next stage when opening a blank rule). */
  toStage: StageOption;
  stages: StageOption[];
  entity: Entity;
  value: AutomationStageTransition | null;
  onSave: (transition: AutomationStageTransition) => void | Promise<void>;
  onClear: () => void | Promise<void>;
  onClose: () => void;
  /** Label for applying changes to the parent draft. */
  commitLabel?: string;
};

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

function StageSelectValue({
  stage,
  fallback,
}: {
  stage?: StageOption;
  fallback: string;
}) {
  if (!stage) return fallback;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: stage.color || "var(--muted-foreground)" }}
      />
      <span className="truncate">{stage.name}</span>
    </span>
  );
}

/** Terminal list option — no further stage-map (BPMN end). */
export function FinalStageInspector({
  stage,
  orphanCount,
  onClearOrphans,
  onClose,
}: {
  stage: StageOption;
  orphanCount: number;
  onClearOrphans: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleClear() {
    if (busy || orphanCount === 0) return;
    setBusy(true);
    try {
      await onClearOrphans();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-700 dark:text-emerald-400">
              <CircleCheck className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Завершающая стадия</h3>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {stage.name}
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

      <div className="min-h-0 flex-1 space-y-3 overflow-auto pt-4">
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2.5">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Вариант списка помечен как «Завершающий» — это конец процесса.
            Исходящие переходы на другие стадии не нужны и не настраиваются. На
            эту стадию по-прежнему можно приходить.
          </p>
        </div>

        {orphanCount > 0 ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5">
            <p className="text-[11px] leading-relaxed text-amber-900/90 dark:text-amber-200/90">
              Осталось {orphanCount}{" "}
              {pluralRu(
                orphanCount,
                "исходящее правило",
                "исходящих правила",
                "исходящих правил",
              )}
              , настроенных до включения «Завершающий». Их можно убрать — на
              карте они уже не отображаются.
            </p>
          </div>
        ) : (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Исходящих переходов нет. Чтобы снова вести запись дальше, снимите
            «Завершающий» в настройках поля списка.
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border pt-3">
        {orphanCount > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-destructive"
            disabled={busy}
            onClick={() => void handleClear()}
          >
            <Trash2 className="size-3.5" />
            Убрать исходящие
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Закрыть
        </Button>
      </div>
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

  const thenStages = stages.filter((stage) => stage.id !== fromStage.id);
  const thenStage =
    stages.find((stage) => stage.id === draft.toOptionId) ?? toStage;
  const elseStages = stages.filter(
    (stage) => stage.id !== fromStage.id && stage.id !== draft.toOptionId,
  );
  const elseStage = stages.find((stage) => stage.id === draft.elseOptionId);
  const hasRules = draft.conditions.rules.length > 0;

  async function handleSave() {
    if (saving) return;
    if (!draft.toOptionId || draft.toOptionId === fromStage.id) return;
    setSaving(true);
    try {
      const hasConditions = draft.conditions.rules.length > 0;
      await onSave({
        ...draft,
        fromOptionId: fromStage.id,
        toOptionId: draft.toOptionId,
        conditions: hasConditions
          ? draft.conditions
          : emptyAutomationConditions(draft.conditions.match),
        elseOptionId:
          !hasConditions || draft.elseOptionId === draft.toOptionId
            ? ""
            : draft.elseOptionId,
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
              <h3 className="text-sm font-semibold">Переход дальше</h3>
              <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <span className="truncate font-medium text-foreground/80">
                  {fromStage.name}
                </span>
                <ArrowRight className="size-3 shrink-0 opacity-60" />
                <span className="truncate font-medium text-foreground/80">
                  {thenStage.name}
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
            {hasRules
              ? `При переходе с «${fromStage.name}» на «${thenStage.name}» проверяются условия. Если выполнены — запись идёт дальше; иначе — на другую стадию или переход запрещается.`
              : `Переход с «${fromStage.name}» на «${thenStage.name}» без проверки условий — всегда разрешён.`}
          </p>
        </div>

        <div className="flex flex-col gap-1.5 pt-3">
          <Label className="text-xs font-medium">Если выполняется</Label>
          <ConditionGroupBuilder
            entity={entity}
            allowNone
            value={draft.conditions}
            onChange={(conditions) =>
              setDraft((prev) => ({
                ...prev,
                conditions,
                elseOptionId:
                  conditions.rules.length === 0 ? "" : prev.elseOptionId,
              }))
            }
          />
        </div>

        {hasRules ? <BranchFork className="mt-1" /> : null}

        <div
          className={cn(
            "gap-3",
            hasRules ? "grid grid-cols-2" : "flex flex-col pt-3",
          )}
        >
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
            <Select
              value={draft.toOptionId}
              onValueChange={(next) => {
                if (next == null) return;
                const value = String(next);
                setDraft((prev) => ({
                  ...prev,
                  toOptionId: value,
                  elseOptionId:
                    prev.elseOptionId === value ? "" : prev.elseOptionId,
                }));
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  <StageSelectValue
                    stage={thenStage}
                    fallback="Выберите стадию"
                  />
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {thenStages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    <StageSelectValue stage={stage} fallback={stage.name} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] leading-snug text-muted-foreground">
              {hasRules
                ? "Куда перейдёт запись при выполнении условий"
                : "Куда перейдёт запись"}
            </p>
          </div>

          {hasRules ? (
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
                      <StageSelectValue
                        stage={elseStage}
                        fallback="Другая стадия"
                      />
                    ) : (
                      "Запретить переход"
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__block__">Запретить переход</SelectItem>
                  {elseStages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      <StageSelectValue stage={stage} fallback={stage.name} />
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
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button
          type="button"
          size="sm"
          disabled={saving || !draft.toOptionId}
          onClick={() => void handleSave()}
        >
          {commitLabel}
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
            Убрать правило
          </Button>
        ) : null}
      </div>
    </div>
  );
}
