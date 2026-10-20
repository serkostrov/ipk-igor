import { useEffect, useRef } from "react";
import { GitBranch, Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  createAutomationActionId,
  createAutomationOutcomeId,
  emptyAutomationConditions,
  emptyAutomationOutcomeFieldAccess,
  getOutcomeStageOptionId,
  normalizeAutomationOutcomeFieldAccess,
  withOutcomeStageAction,
  withoutOutcomeStageAction,
  type AutomationConditions,
  type AutomationOutcome,
} from "@/entities/automation";
import { isEntityRecordsTab, type Entity } from "@/entities/entity";
import { cn } from "@/shared/lib/cn";
import { ConditionGroupBuilder } from "./ConditionGroupBuilder";
import { OutcomeAutofillEditor } from "./OutcomeAutofillEditor";
import { OutcomeStageSelect } from "./OutcomeStageSelect";

type StageOption = { id: string; name: string };

type OutcomeRouteBranchesEditorProps = {
  outcomes: AutomationOutcome[];
  onChange: (outcomes: AutomationOutcome[]) => void;
  entity: Entity;
  entities: Entity[];
  /** Process list field — stage moves write here via setField. */
  triggerFieldId: string;
  stages: StageOption[];
};

/** Keep comment flags; autofill has no ask-form (clear visible/required). */
function branchFieldAccess(
  access: AutomationOutcome["fieldAccess"] | undefined,
) {
  const normalized = normalizeAutomationOutcomeFieldAccess(access);
  return {
    ...emptyAutomationOutcomeFieldAccess(),
    commentFieldIds: normalized.commentFieldIds,
  };
}

function normalizeBranches(outcomes: AutomationOutcome[]): AutomationOutcome[] {
  if (outcomes.length === 0) {
    return [
      {
        id: createAutomationOutcomeId(),
        label: "Иначе",
        color: null,
        actions: [],
        fieldAccess: emptyAutomationOutcomeFieldAccess(),
        conditions: emptyAutomationConditions(),
      },
    ];
  }
  return outcomes.map((item, index, list) => {
    const isElse = index === list.length - 1;
    return {
      ...item,
      label: isElse
        ? "Иначе"
        : item.label.trim() && item.label !== "Иначе"
          ? item.label
          : "Если",
      conditions: isElse ? emptyAutomationConditions() : item.conditions,
      fieldAccess: branchFieldAccess(item.fieldAccess),
    };
  });
}

/** Ordered if/else stage routes for autofill steps. */
export function OutcomeRouteBranchesEditor({
  outcomes,
  onChange,
  entity,
  entities,
  triggerFieldId,
  stages,
}: OutcomeRouteBranchesEditorProps) {
  const branches = normalizeBranches(outcomes);
  /** Latest branches for sync multi-patches (actions + fieldAccess). */
  const branchesRef = useRef(branches);
  useEffect(() => {
    branchesRef.current = branches;
  }, [branches]);

  function commit(next: AutomationOutcome[]) {
    const normalized = normalizeBranches(next);
    branchesRef.current = normalized;
    onChange(normalized);
  }

  function patchBranch(index: number, patch: Partial<AutomationOutcome>) {
    commit(
      branchesRef.current.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    );
  }

  function addIfBranch() {
    const next = [...branches];
    next.splice(Math.max(0, next.length - 1), 0, {
      id: createAutomationOutcomeId(),
      label: "Если",
      color: null,
      actions: triggerFieldId
        ? [
            {
              id: createAutomationActionId(),
              kind: "setField",
              fieldId: triggerFieldId,
              value: stages[0]?.id ?? "",
            },
          ]
        : [],
      fieldAccess: emptyAutomationOutcomeFieldAccess(),
      conditions: emptyAutomationConditions(),
    });
    commit(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground shadow-xs">
          <GitBranch className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">
            Условные переходы
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            Проверяются сверху вниз. Первая подходящая ветка применится;
            последняя — «иначе», если ничего не совпало.
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5">
        {branches.map((branch, index) => {
          const isElse = index === branches.length - 1;
          const hasRules = branch.conditions.rules.length > 0;
          const stageId = getOutcomeStageOptionId(
            branch.actions,
            triggerFieldId,
          );
          const actionsWithoutStage = withoutOutcomeStageAction(
            branch.actions,
            triggerFieldId,
          );

          return (
            <li
              key={branch.id}
              className={cn(
                "rounded-xl border bg-card p-3 shadow-xs",
                isElse ? "border-border/80" : "border-border/70",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex h-6 shrink-0 items-center rounded-md px-2 text-[11px] font-semibold tracking-wide uppercase",
                      isElse
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    {isElse ? "Иначе" : `Если ${index + 1}`}
                  </span>
                  {!isElse ? (
                    <Input
                      value={branch.label === "Если" ? "" : branch.label}
                      placeholder="Название ветки"
                      className="h-7 max-w-[10rem] text-xs"
                      onChange={(event) =>
                        patchBranch(index, {
                          label: event.target.value.trim() || "Если",
                        })
                      }
                    />
                  ) : null}
                </div>
                {!isElse ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    aria-label="Удалить ветку"
                    onClick={() =>
                      commit(branches.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </div>

              {!isElse ? (
                <div className="mt-3 flex flex-col gap-1.5">
                  <Label className="text-xs">Условие</Label>
                  <ConditionGroupBuilder
                    entity={entity}
                    value={branch.conditions}
                    onChange={(conditions: AutomationConditions) =>
                      patchBranch(index, { conditions })
                    }
                  />
                  {!hasRules ? (
                    <p className="text-[10px] text-amber-700 dark:text-amber-400">
                      Добавьте условие — иначе ветка сработает всегда и
                      перекроет нижние
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Если ни одна ветка выше не подошла
                </p>
              )}

              <div className="mt-3">
                <OutcomeStageSelect
                  compact
                  value={stageId}
                  stages={stages}
                  triggerFieldId={triggerFieldId}
                  onChange={(nextStageId) =>
                    patchBranch(index, {
                      actions: withOutcomeStageAction(
                        actionsWithoutStage,
                        triggerFieldId,
                        nextStageId,
                      ),
                    })
                  }
                />
              </div>

              <div className="mt-3">
                <OutcomeAutofillEditor
                  actions={actionsWithoutStage}
                  fieldAccess={branch.fieldAccess}
                  sourceEntity={entity}
                  entities={entities}
                  hasRecordsTab={entity.tabs.some(isEntityRecordsTab)}
                  excludeFieldIds={
                    triggerFieldId ? [triggerFieldId] : undefined
                  }
                  hint="Заполнить поля и при необходимости дублировать во «Записи»"
                  onChange={(actions) =>
                    patchBranch(index, {
                      actions: withOutcomeStageAction(
                        actions,
                        triggerFieldId,
                        stageId,
                      ),
                    })
                  }
                  onFieldAccessChange={(fieldAccess) =>
                    patchBranch(index, {
                      fieldAccess: branchFieldAccess(fieldAccess),
                    })
                  }
                />
              </div>
            </li>
          );
        })}
      </ul>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={addIfBranch}
      >
        <Plus className="size-3.5" />
        Ветка «если»
      </Button>
    </div>
  );
}
