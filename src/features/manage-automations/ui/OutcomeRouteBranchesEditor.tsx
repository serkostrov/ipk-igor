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
        buttonMode: "auto",
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
      buttonMode: "auto",
    });
    commit(next);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-3.5">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <GitBranch
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <h4 className="truncate text-sm font-semibold text-foreground">
            Условные переходы
          </h4>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7"
          onClick={addIfBranch}
        >
          <Plus className="size-3.5" />
          Ветка
        </Button>
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
                "rounded-lg border bg-muted/10 p-3",
                isElse ? "border-border/70" : "border-border/60",
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
                  <Label className="text-xs font-medium text-muted-foreground">
                    Условие
                  </Label>
                  <ConditionGroupBuilder
                    entity={entity}
                    value={branch.conditions}
                    onChange={(conditions: AutomationConditions) =>
                      patchBranch(index, { conditions })
                    }
                  />
                  {!hasRules ? (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      Без условия ветка сработает всегда
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Если ничего выше не подошло
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
                  hint="Значения подставятся сами; «комм.» — ещё и в «Записи»"
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
    </div>
  );
}
