import { useMemo, useState, type ReactNode } from "react";
import { Filter, GitBranch, Plus } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import {
  createAutomationScenarioId,
  createAutomationTemplateId,
  createDefaultProcess,
  defaultAssigneeResolver,
  defaultDecisionOutcomes,
  emptyAutomationConditions,
  findStageTransition,
  removeTemplate,
  saveProcess,
  saveScenario,
  saveTemplate,
  useAutomationConfig,
  useAutomationStatus,
  type AutomationCanvasLayout,
  type AutomationLaunchPhase,
  type AutomationProcess,
  type AutomationScenario,
  type AutomationStageTransition,
  type AutomationTaskTemplate,
} from "@/entities/automation";
import {
  getEntityFieldDisplayName,
  resolveEntityListFieldOptions,
  useEntityConfig,
} from "@/entities/entity";
import { AutomationFlowCanvas } from "./AutomationFlowCanvas";
import { ConditionGroupBuilder } from "./ConditionGroupBuilder";
import { StageTransitionInspector } from "./StageTransitionInspector";
import { TemplateInspector } from "./TemplateInspector";

const controlTriggerClass = "h-9 w-[11.5rem]";

export function AutomationBuilder({ leading }: { leading?: ReactNode }) {
  const { entities } = useEntityConfig();
  const { processes, scenarios, templates, notificationRules } =
    useAutomationConfig();
  const status = useAutomationStatus();

  const entitiesWithList = useMemo(
    () =>
      entities.filter((entity) =>
        entity.fields.some((field) => field.type === "list"),
      ),
    [entities],
  );

  const [entityId, setEntityId] = useState("");
  const [triggerFieldId, setTriggerFieldId] = useState("");

  const resolvedEntityId =
    entityId ||
    processes[0]?.entityId ||
    entitiesWithList[0]?.id ||
    entities[0]?.id ||
    "";
  const entity = entities.find((item) => item.id === resolvedEntityId) ?? null;
  const listFields = useMemo(
    () => entity?.fields.filter((field) => field.type === "list") ?? [],
    [entity],
  );
  const resolvedTriggerFieldId =
    (triggerFieldId && listFields.some((field) => field.id === triggerFieldId)
      ? triggerFieldId
      : null) ||
    processes.find((item) => item.entityId === resolvedEntityId)
      ?.triggerFieldId ||
    listFields[0]?.id ||
    "";

  const process = useMemo(
    () =>
      processes.find(
        (item) =>
          item.entityId === resolvedEntityId &&
          item.triggerFieldId === resolvedTriggerFieldId,
      ) ?? null,
    [processes, resolvedEntityId, resolvedTriggerFieldId],
  );

  const processScenarios = useMemo(
    () =>
      process
        ? scenarios
            .filter((item) => item.processId === process.id)
            .slice()
            .sort(
              (a, b) =>
                Number(b.isDefault) - Number(a.isDefault) ||
                b.priority - a.priority,
            )
        : [],
    [scenarios, process],
  );

  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const scenario =
    processScenarios.find((item) => item.id === scenarioId) ??
    processScenarios.find((item) => item.isDefault) ??
    processScenarios[0] ??
    null;

  const stages = useMemo(() => {
    if (!entity || !resolvedTriggerFieldId) return [];
    const field = entity.fields.find(
      (item) => item.id === resolvedTriggerFieldId,
    );
    if (!field) return [];
    return resolveEntityListFieldOptions(field, entities);
  }, [entity, resolvedTriggerFieldId, entities]);

  const [stageId, setStageId] = useState<string | null>(null);
  const activeStageId = stageId ?? stages[0]?.id ?? null;

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [selectedTransitionEdge, setSelectedTransitionEdge] = useState<{
    fromOptionId: string;
    toOptionId: string;
  } | null>(null);

  const scenarioTemplates = useMemo(
    () =>
      scenario
        ? templates.filter((item) => item.scenarioId === scenario.id)
        : [],
    [templates, scenario],
  );

  const selectedTemplate =
    scenarioTemplates.find((item) => item.id === selectedTemplateId) ?? null;

  const selectedTransitionStages = useMemo(() => {
    if (!selectedTransitionEdge) return null;
    const fromStage =
      stages.find((item) => item.id === selectedTransitionEdge.fromOptionId) ??
      null;
    const toStage =
      stages.find((item) => item.id === selectedTransitionEdge.toOptionId) ??
      null;
    if (!fromStage || !toStage) return null;
    return { fromStage, toStage };
  }, [selectedTransitionEdge, stages]);

  const selectedTransitionKey = selectedTransitionEdge
    ? `${selectedTransitionEdge.fromOptionId}\0${selectedTransitionEdge.toOptionId}`
    : null;

  const selectedTransition = selectedTransitionEdge
    ? findStageTransition(
        scenario?.stageTransitions ?? [],
        selectedTransitionEdge.fromOptionId,
        selectedTransitionEdge.toOptionId,
      )
    : null;

  async function ensureProcess(): Promise<{
    process: AutomationProcess;
    scenario: AutomationScenario;
  } | null> {
    if (!resolvedEntityId || !resolvedTriggerFieldId) return null;
    if (process && scenario) return { process, scenario };
    if (process && !scenario) {
      const next: AutomationScenario = {
        id: createAutomationScenarioId(),
        processId: process.id,
        name: "Основной",
        isDefault: true,
        entryConditions: emptyAutomationConditions(),
        priority: 0,
        canvasLayout: {},
        stageTransitions: [],
      };
      await saveScenario(next);
      setScenarioId(next.id);
      return { process, scenario: next };
    }
    const created = createDefaultProcess({
      name: `${entity?.name ?? "Сущность"} · автоматизация`,
      entityId: resolvedEntityId,
      triggerFieldId: resolvedTriggerFieldId,
    });
    await saveProcess(created.process);
    await saveScenario(created.scenario);
    setEntityId(resolvedEntityId);
    setTriggerFieldId(resolvedTriggerFieldId);
    setScenarioId(created.scenario.id);
    return created;
  }

  async function addScenario() {
    const ensured = await ensureProcess();
    if (!ensured) return;
    const next: AutomationScenario = {
      id: createAutomationScenarioId(),
      processId: ensured.process.id,
      name: `Сценарий ${processScenarios.length + 1}`,
      isDefault: false,
      entryConditions: emptyAutomationConditions(),
      priority: 10,
      canvasLayout: {},
      stageTransitions: [],
    };
    await saveScenario(next);
    setScenarioId(next.id);
  }

  async function addTemplate(
    stageOptionId?: string,
    launchPhase: AutomationLaunchPhase = "onEnter",
    insertAt?: number,
  ) {
    const targetStageId = stageOptionId ?? activeStageId;
    if (!targetStageId) return;
    const ensured = await ensureProcess();
    if (!ensured) return;
    const phaseList = scenarioTemplates
      .filter(
        (item) =>
          item.triggerOptionId === targetStageId &&
          (item.launchPhase ?? "onEnter") === launchPhase,
      )
      .slice()
      .sort(
        (a, b) =>
          a.stepOrder - b.stepOrder || a.name.localeCompare(b.name, "ru"),
      );
    const at = Math.max(
      0,
      Math.min(insertAt ?? phaseList.length, phaseList.length),
    );
    const template: AutomationTaskTemplate = {
      id: createAutomationTemplateId(),
      scenarioId: ensured.scenario.id,
      name: "Новая задача",
      nameTemplate: "",
      description: "",
      triggerOptionId: targetStageId,
      stepOrder: at,
      isBlocking: true,
      kind: "decision",
      launchPhase,
      launchConditions: emptyAutomationConditions(),
      assignee: defaultAssigneeResolver(),
      watchers: defaultAssigneeResolver(),
      outcomes: defaultDecisionOutcomes(),
      sla: null,
      materials: [],
    };
    phaseList.splice(at, 0, template);
    for (const [index, item] of phaseList.entries()) {
      const next = { ...item, stepOrder: index, launchPhase };
      if (item.id === template.id || item.stepOrder !== index) {
        await saveTemplate(next);
      }
    }
    setStageId(targetStageId);
    setSelectedTemplateId(template.id);
  }

  async function moveTemplate(
    templateId: string,
    targetStageId: string,
    stepOrder: number,
    launchPhase: AutomationLaunchPhase = "onEnter",
  ) {
    const moving = scenarioTemplates.find((item) => item.id === templateId);
    if (!moving) return;

    const without = scenarioTemplates.filter((item) => item.id !== templateId);
    const sourcePhase = moving.launchPhase ?? "onEnter";
    const sourceStageId = moving.triggerOptionId;

    const targetList = without
      .filter(
        (item) =>
          item.triggerOptionId === targetStageId &&
          (item.launchPhase ?? "onEnter") === launchPhase,
      )
      .slice()
      .sort((a, b) => a.stepOrder - b.stepOrder);
    const insertAt = Math.max(0, Math.min(stepOrder, targetList.length));
    targetList.splice(insertAt, 0, {
      ...moving,
      triggerOptionId: targetStageId,
      launchPhase,
    });

    const updates: AutomationTaskTemplate[] = targetList.map((item, index) => ({
      ...item,
      triggerOptionId: targetStageId,
      launchPhase,
      stepOrder: index,
    }));

    if (sourceStageId !== targetStageId || sourcePhase !== launchPhase) {
      const sourceList = without
        .filter(
          (item) =>
            item.triggerOptionId === sourceStageId &&
            (item.launchPhase ?? "onEnter") === sourcePhase,
        )
        .slice()
        .sort((a, b) => a.stepOrder - b.stepOrder);
      sourceList.forEach((item, index) => {
        updates.push({ ...item, stepOrder: index });
      });
    }

    for (const item of updates) {
      const prev = scenarioTemplates.find((t) => t.id === item.id);
      if (
        !prev ||
        prev.triggerOptionId !== item.triggerOptionId ||
        prev.stepOrder !== item.stepOrder ||
        (prev.launchPhase ?? "onEnter") !== (item.launchPhase ?? "onEnter")
      ) {
        await saveTemplate(item);
      }
    }
  }

  async function saveCanvasLayout(canvasLayout: AutomationCanvasLayout) {
    if (!scenario) return;
    const prev = scenario.canvasLayout;
    const same =
      Object.keys(canvasLayout).length === Object.keys(prev).length &&
      Object.entries(canvasLayout).every(([id, pos]) => {
        const was = prev[id];
        return was != null && was.x === pos.x && was.y === pos.y;
      });
    if (same) return;
    await saveScenario({ ...scenario, canvasLayout });
  }

  function selectTransition(fromOptionId: string, toOptionId: string) {
    if (!fromOptionId || !toOptionId) {
      setSelectedTransitionEdge(null);
      return;
    }
    setSelectedTemplateId(null);
    setSelectedTransitionEdge({ fromOptionId, toOptionId });
  }

  async function saveStageTransition(transition: AutomationStageTransition) {
    const ensured = await ensureProcess();
    if (!ensured) return;
    const current = ensured.scenario.stageTransitions ?? [];
    const next = [
      ...current.filter(
        (item) =>
          !(
            item.fromOptionId === transition.fromOptionId &&
            item.toOptionId === transition.toOptionId
          ),
      ),
      transition,
    ];
    await saveScenario({ ...ensured.scenario, stageTransitions: next });
  }

  async function clearStageTransition(
    fromOptionId: string,
    toOptionId: string,
  ) {
    if (!scenario) return;
    await saveScenario({
      ...scenario,
      stageTransitions: scenario.stageTransitions.filter(
        (item) =>
          !(
            item.fromOptionId === fromOptionId && item.toOptionId === toOptionId
          ),
      ),
    });
    setSelectedTransitionEdge(null);
  }

  function selectEntity(nextId: string) {
    setEntityId(nextId);
    const nextEntity = entities.find((item) => item.id === nextId);
    const nextLists =
      nextEntity?.fields.filter((field) => field.type === "list") ?? [];
    const existing = processes.find((item) => item.entityId === nextId);
    const nextField = existing?.triggerFieldId ?? nextLists[0]?.id ?? "";
    setTriggerFieldId(nextField);
    setScenarioId(null);
    setStageId(null);
    setSelectedTemplateId(null);
    setSelectedTransitionEdge(null);
  }

  function selectField(nextFieldId: string) {
    setTriggerFieldId(nextFieldId);
    setScenarioId(null);
    setStageId(null);
    setSelectedTemplateId(null);
    setSelectedTransitionEdge(null);
  }

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={resolvedEntityId || undefined}
        onValueChange={(next) => {
          if (next != null) selectEntity(String(next));
        }}
      >
        <SelectTrigger className={controlTriggerClass}>
          <SelectValue>{entity?.name || "Сущность"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {(entitiesWithList.length > 0 ? entitiesWithList : entities).map(
            (item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>

      <Select
        value={resolvedTriggerFieldId || undefined}
        onValueChange={(next) => {
          if (next != null) selectField(String(next));
        }}
        disabled={listFields.length === 0}
      >
        <SelectTrigger
          className={controlTriggerClass}
          disabled={listFields.length === 0}
        >
          <SelectValue>
            {listFields.find((field) => field.id === resolvedTriggerFieldId)
              ? getEntityFieldDisplayName(
                  listFields.find(
                    (field) => field.id === resolvedTriggerFieldId,
                  )!,
                )
              : "Поле стадии"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {listFields.map((field) => (
            <SelectItem key={field.id} value={field.id}>
              {getEntityFieldDisplayName(field)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={scenario?.id}
        onValueChange={(next) => {
          if (next != null) {
            setScenarioId(String(next));
            setSelectedTemplateId(null);
          }
        }}
        disabled={!scenario}
      >
        <SelectTrigger className={controlTriggerClass}>
          <SelectValue>
            <span className="inline-flex items-center gap-1.5">
              <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{scenario?.name ?? "Сценарий"}</span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {processScenarios.map((item) => {
            const hasEntryRules = item.entryConditions.rules.length > 0;
            const suffix = item.isDefault
              ? !/основн|default|по умолчанию/i.test(item.name)
                ? " · по умолчанию"
                : ""
              : hasEntryRules
                ? ""
                : " · нет условий";
            return (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
                {suffix}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-9 shrink-0"
        aria-label="Новый сценарий"
        disabled={!resolvedEntityId || !resolvedTriggerFieldId}
        onClick={() => void addScenario()}
      >
        <Plus className="size-4" />
      </Button>

      {scenario && !scenario.isDefault && entity ? (
        <Popover>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9 shrink-0"
                aria-label="Условия сценария"
                title="Условия сценария"
              />
            }
          >
            <Filter className="size-4" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-3">
            <p className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Условия сценария
            </p>
            {scenario.entryConditions.rules.length === 0 ? (
              <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">
                Без условий этот сценарий не запускается — задачи берутся из
                сценария по умолчанию.
              </p>
            ) : null}
            <ConditionGroupBuilder
              entity={entity}
              value={scenario.entryConditions}
              onChange={(entryConditions) =>
                void saveScenario({ ...scenario, entryConditions })
              }
            />
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );

  if (status === "idle" || status === "loading") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">{leading}</div>
        </div>
        <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/30" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">{leading}</div>
        {toolbar}
      </div>

      {!resolvedEntityId ||
      !resolvedTriggerFieldId ||
      listFields.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <div className="max-w-md">
            <p className="text-sm font-medium">
              Выберите сущность и поле стадии
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Нужно поле типа «Список» — его варианты станут стадиями на карте.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
          <main className="relative min-h-0 min-w-0 flex-1">
            {stages.length > 0 ? (
              <AutomationFlowCanvas
                stages={stages}
                templates={scenarioTemplates}
                stageTransitions={scenario?.stageTransitions ?? []}
                activeStageId={activeStageId}
                selectedTemplateId={selectedTemplateId}
                selectedTransitionKey={selectedTransitionKey}
                canvasLayout={scenario?.canvasLayout ?? {}}
                fields={entity?.fields ?? []}
                onSelectStage={(id) => {
                  setStageId(id);
                  setSelectedTransitionEdge(null);
                }}
                onSelectTemplate={(id) => {
                  setSelectedTemplateId(id);
                  if (id) setSelectedTransitionEdge(null);
                }}
                onSelectTransition={selectTransition}
                onAdd={(stageOptionId, launchPhase, insertAt) =>
                  void addTemplate(stageOptionId, launchPhase, insertAt)
                }
                onMoveTemplate={(
                  templateId,
                  stageOptionId,
                  stepOrder,
                  launchPhase,
                ) =>
                  void moveTemplate(
                    templateId,
                    stageOptionId,
                    stepOrder,
                    launchPhase,
                  )
                }
                onCanvasLayoutChange={(layout) => void saveCanvasLayout(layout)}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                У поля стадии нет вариантов
              </div>
            )}
          </main>

          {selectedTransitionStages && selectedTransitionEdge && entity ? (
            <aside
              className="relative z-20 hidden h-full min-h-0 w-[min(34rem,40vw)] min-w-[28rem] shrink-0 flex-col overflow-hidden border-l border-border bg-card xl:flex"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="flex min-h-0 flex-1 flex-col p-4">
                <StageTransitionInspector
                  key={selectedTransitionKey ?? "transition"}
                  fromStage={selectedTransitionStages.fromStage}
                  toStage={selectedTransitionStages.toStage}
                  stages={stages}
                  entity={entity}
                  value={selectedTransition}
                  onSave={async (transition) => {
                    await saveStageTransition(transition);
                  }}
                  onClear={() =>
                    void clearStageTransition(
                      selectedTransitionEdge.fromOptionId,
                      selectedTransitionEdge.toOptionId,
                    )
                  }
                  onClose={() => setSelectedTransitionEdge(null)}
                />
              </div>
            </aside>
          ) : selectedTemplate && entity ? (
            <aside
              className="relative z-20 hidden h-full min-h-0 w-[min(34rem,40vw)] min-w-[28rem] shrink-0 flex-col overflow-hidden border-l border-border bg-card xl:flex"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="flex min-h-0 flex-1 flex-col p-4">
                <TemplateInspector
                  key={selectedTemplate.id}
                  template={selectedTemplate}
                  entity={entity}
                  entities={entities}
                  options={stages}
                  triggerFieldId={resolvedTriggerFieldId}
                  notificationRules={notificationRules.filter(
                    (rule) => rule.templateId === selectedTemplate.id,
                  )}
                  onSave={(next) => saveTemplate(next)}
                  onDelete={() => {
                    void removeTemplate(selectedTemplate.id);
                    setSelectedTemplateId(null);
                  }}
                />
              </div>
            </aside>
          ) : null}
        </div>
      )}
    </div>
  );
}
