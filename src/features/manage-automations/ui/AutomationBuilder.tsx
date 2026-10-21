import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Filter,
  GitBranch,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import {
  cloneAutomationScenario,
  createAutomationScenarioId,
  createAutomationStageTransitionId,
  createAutomationTemplateId,
  createDefaultProcess,
  defaultAssigneeResolver,
  defaultWatcherResolver,
  defaultDecisionOutcomes,
  emptyAutomationCanvasLayout,
  emptyAutomationConditions,
  findStageTransition,
  type AutomationStageTaskRelease,
  removeScenario,
  removeTemplate,
  saveNotificationRule,
  saveProcess,
  saveScenario,
  saveTemplate,
  useAutomationConfig,
  useAutomationStatus,
  withOutcomeStageAction,
  type AutomationCanvasLayout,
  type AutomationCanvasNodePositions,
  type AutomationLaunchPhase,
  type AutomationProcess,
  type AutomationScenario,
  type AutomationStageTransition,
  type AutomationTaskTemplate,
} from "@/entities/automation";
import {
  getEntityFieldDisplayName,
  isEntityListOptionFinal,
  resolveEntityListFieldOptions,
  useEntityConfig,
} from "@/entities/entity";
import { useLocalStorageState } from "@/shared/hooks/use-local-storage-state";
import { AutomationFlowCanvas } from "./AutomationFlowCanvas";
import { ConditionGroupBuilder } from "./ConditionGroupBuilder";
import {
  FinalStageInspector,
  StageTransitionInspector,
} from "./StageTransitionInspector";
import { TemplateInspector } from "./TemplateInspector";

const controlTriggerClass = "h-9 w-[11.5rem]";
const EMPTY_CANVAS_LAYOUT = emptyAutomationCanvasLayout();
const UNDO_LIMIT = 40;
const AUTOMATION_ENTITY_ID_KEY = "settings.automations.selectedEntityId";
const AUTOMATION_TRIGGER_FIELD_ID_KEY =
  "settings.automations.selectedTriggerFieldId";

function parseStoredId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type AutomationEditSnapshot = {
  scenario: AutomationScenario;
  templates: AutomationTaskTemplate[];
};

function canvasPositionsEqual(
  a: AutomationCanvasNodePositions,
  b: AutomationCanvasNodePositions,
) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((id) => {
    const left = a[id];
    const right = b[id];
    return (
      left != null && right != null && left.x === right.x && left.y === right.y
    );
  });
}

function idListEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
}

function cloneSnap(snap: AutomationEditSnapshot): AutomationEditSnapshot {
  return {
    scenario: structuredClone(snap.scenario),
    templates: structuredClone(snap.templates),
  };
}

function snapsEqual(
  a: AutomationEditSnapshot,
  b: AutomationEditSnapshot,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function makeSnap(
  scenario: AutomationScenario,
  allTemplates: AutomationTaskTemplate[],
): AutomationEditSnapshot {
  return {
    scenario: structuredClone(scenario),
    templates: structuredClone(
      allTemplates.filter((item) => item.scenarioId === scenario.id),
    ),
  };
}

function templatesChanged(
  prev: AutomationTaskTemplate | undefined,
  next: AutomationTaskTemplate,
): boolean {
  return !prev || JSON.stringify(prev) !== JSON.stringify(next);
}

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

  const [storedEntityId, setStoredEntityId] = useLocalStorageState(
    AUTOMATION_ENTITY_ID_KEY,
    parseStoredId,
    null,
  );
  const [storedTriggerFieldId, setStoredTriggerFieldId] = useLocalStorageState(
    AUTOMATION_TRIGGER_FIELD_ID_KEY,
    parseStoredId,
    null,
  );

  const resolvedEntityId =
    (storedEntityId && entities.some((item) => item.id === storedEntityId)
      ? storedEntityId
      : null) ||
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
    (storedTriggerFieldId &&
    listFields.some((field) => field.id === storedTriggerFieldId)
      ? storedTriggerFieldId
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
  const storeScenario =
    processScenarios.find((item) => item.id === scenarioId) ??
    processScenarios.find((item) => item.isDefault) ??
    processScenarios[0] ??
    null;

  const [draft, setDraft] = useState<AutomationEditSnapshot | null>(null);
  const [saved, setSaved] = useState<AutomationEditSnapshot | null>(null);
  const [undoStack, setUndoStack] = useState<AutomationEditSnapshot[]>([]);
  const [persisting, setPersisting] = useState(false);
  /** Remount inspectors after undo/revert so their local drafts match. */
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [seededScenarioId, setSeededScenarioId] = useState<string | null>(null);

  const storeScenarioId = storeScenario?.id ?? null;
  if (storeScenarioId !== seededScenarioId) {
    setSeededScenarioId(storeScenarioId);
    if (!storeScenario) {
      setDraft(null);
      setSaved(null);
      setUndoStack([]);
    } else if (draft?.scenario.id !== storeScenario.id) {
      // Keep a draft already prepared by ensureProcess / scenario switch.
      const snap = makeSnap(storeScenario, templates);
      setDraft(snap);
      setSaved(cloneSnap(snap));
      setUndoStack([]);
    }
  }

  const scenario =
    draft && storeScenario && draft.scenario.id === storeScenario.id
      ? draft.scenario
      : null;
  const dirty = Boolean(draft && saved && !snapsEqual(draft, saved));
  const canUndo = undoStack.length > 0;
  const showEditActions = dirty || canUndo;

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
  const [inspectStageId, setInspectStageId] = useState<string | null>(null);
  const [inspectToOptionId, setInspectToOptionId] = useState<string | null>(
    null,
  );
  const [createScenarioOpen, setCreateScenarioOpen] = useState(false);
  const [createScenarioSourceId, setCreateScenarioSourceId] = useState<
    string | "new"
  >("new");
  const [createScenarioBusy, setCreateScenarioBusy] = useState(false);
  const [deleteScenarioTarget, setDeleteScenarioTarget] =
    useState<AutomationScenario | null>(null);
  const canvasLayout = scenario?.canvasLayout ?? EMPTY_CANVAS_LAYOUT;
  const collapsedStageIds = useMemo(
    () => new Set(canvasLayout.collapsedStageIds),
    [canvasLayout.collapsedStageIds],
  );

  function openStageTransition(fromOptionId: string, toOptionId?: string) {
    setSelectedTemplateId(null);
    setStageId(fromOptionId);
    setInspectStageId(fromOptionId);
    const fromStage = stages.find((item) => item.id === fromOptionId);
    // Final stages are process ends — no «переход дальше» editor.
    if (isEntityListOptionFinal(fromStage)) {
      setInspectToOptionId(null);
      return;
    }
    const fromIndex = stages.findIndex((item) => item.id === fromOptionId);
    const nextId = fromIndex >= 0 ? (stages[fromIndex + 1]?.id ?? null) : null;
    const existingFrom = (scenario?.stageTransitions ?? []).filter(
      (item) => item.fromOptionId === fromOptionId,
    );
    const preferred =
      toOptionId ??
      existingFrom.find((item) => item.toOptionId === nextId)?.toOptionId ??
      existingFrom[0]?.toOptionId ??
      nextId;
    setInspectToOptionId(preferred);
  }

  function clearOutgoingFromStage(fromOptionId: string) {
    if (!fromOptionId) return;
    updateDraft((prev) => ({
      ...prev,
      scenario: {
        ...prev.scenario,
        stageTransitions: prev.scenario.stageTransitions.filter(
          (item) => item.fromOptionId !== fromOptionId,
        ),
      },
    }));
  }

  function assertCanMapFromStage(fromOptionId: string): boolean {
    const fromStage = stages.find((item) => item.id === fromOptionId);
    if (!isEntityListOptionFinal(fromStage)) return true;
    toast.message("Завершающая стадия", {
      description:
        "С завершающей стадии переходы дальше не настраиваются — это конец процесса.",
    });
    openStageTransition(fromOptionId);
    return false;
  }

  function closeStageInspector() {
    setInspectStageId(null);
    setInspectToOptionId(null);
  }

  function confirmDiscardIfDirty(): boolean {
    if (!dirty) return true;
    return window.confirm(
      "Есть несохранённые изменения. Сбросить их и продолжить?",
    );
  }

  function updateDraft(
    updater: (prev: AutomationEditSnapshot) => AutomationEditSnapshot,
  ) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      if (snapsEqual(prev, next)) return prev;
      setUndoStack((stack) => [...stack, cloneSnap(prev)].slice(-UNDO_LIMIT));
      return next;
    });
  }

  function undoEdit() {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1]!;
      setDraft(cloneSnap(previous));
      setEditorEpoch((epoch) => epoch + 1);
      return stack.slice(0, -1);
    });
  }

  function revertAll() {
    if (!saved) return;
    setDraft(cloneSnap(saved));
    setUndoStack([]);
    setEditorEpoch((epoch) => epoch + 1);
  }

  async function persistDraft() {
    if (!draft || !saved || !dirty || persisting) return;
    setPersisting(true);
    try {
      await saveScenario(draft.scenario);

      const savedById = new Map(
        saved.templates.map((item) => [item.id, item] as const),
      );
      const draftIds = new Set(draft.templates.map((item) => item.id));

      for (const template of draft.templates) {
        if (templatesChanged(savedById.get(template.id), template)) {
          await saveTemplate(template);
        }
      }

      for (const id of savedById.keys()) {
        if (!draftIds.has(id)) {
          await removeTemplate(id);
        }
      }

      const next = cloneSnap(draft);
      setSaved(next);
      setDraft(next);
      setUndoStack([]);
      toast.success("Изменения сохранены");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Не удалось сохранить";
      console.error("[automation] persist draft failed", error);
      toast.error(message);
    } finally {
      setPersisting(false);
    }
  }

  function patchCanvasLayout(patch: Partial<AutomationCanvasLayout>) {
    const apply = (prev: AutomationEditSnapshot): AutomationEditSnapshot => {
      const current = prev.scenario.canvasLayout;
      const nextLayout: AutomationCanvasLayout = {
        positions: patch.positions ?? current.positions,
        collapsedStageIds: patch.collapsedStageIds ?? current.collapsedStageIds,
        hiddenStageLinkKeys:
          patch.hiddenStageLinkKeys ?? current.hiddenStageLinkKeys,
      };
      const same =
        canvasPositionsEqual(current.positions, nextLayout.positions) &&
        idListEqual(current.collapsedStageIds, nextLayout.collapsedStageIds) &&
        idListEqual(
          current.hiddenStageLinkKeys,
          nextLayout.hiddenStageLinkKeys,
        );
      if (same) return prev;
      return {
        ...prev,
        scenario: { ...prev.scenario, canvasLayout: nextLayout },
      };
    };

    if (draft) {
      updateDraft(apply);
      return;
    }

    // First interaction on an entity that had no draft yet.
    void ensureProcess().then((ensured) => {
      if (!ensured) return;
      const base = makeSnap(
        ensured.scenario,
        templates.filter((item) => item.scenarioId === ensured.scenario.id),
      );
      const next = apply(base);
      if (snapsEqual(base, next)) {
        setDraft(base);
        setSaved(cloneSnap(base));
        return;
      }
      setDraft(next);
      setSaved(cloneSnap(base));
      setUndoStack([cloneSnap(base)]);
    });
  }

  function toggleStageCollapse(stageOptionId: string) {
    const next = new Set(collapsedStageIds);
    if (next.has(stageOptionId)) next.delete(stageOptionId);
    else next.add(stageOptionId);
    patchCanvasLayout({ collapsedStageIds: [...next] });
  }

  const scenarioTemplates = draft?.templates ?? [];

  const selectedTemplate =
    scenarioTemplates.find((item) => item.id === selectedTemplateId) ?? null;

  const inspectFromStage = useMemo(() => {
    if (!inspectStageId) return null;
    return stages.find((item) => item.id === inspectStageId) ?? null;
  }, [inspectStageId, stages]);

  const inspectToStage = useMemo(() => {
    if (!inspectFromStage) return null;
    if (inspectToOptionId) {
      const selected = stages.find((item) => item.id === inspectToOptionId);
      if (selected && selected.id !== inspectFromStage.id) return selected;
    }
    const index = stages.findIndex((item) => item.id === inspectFromStage.id);
    const next = index >= 0 ? stages[index + 1] : undefined;
    if (next) return next;
    return stages.find((item) => item.id !== inspectFromStage.id) ?? null;
  }, [inspectFromStage, inspectToOptionId, stages]);

  const inspectTransition =
    inspectFromStage && inspectToStage
      ? findStageTransition(
          scenario?.stageTransitions ?? [],
          inspectFromStage.id,
          inspectToStage.id,
        )
      : null;

  const selectedTransitionKey =
    inspectFromStage && inspectToStage
      ? `${inspectFromStage.id}\0${inspectToStage.id}`
      : null;

  async function ensureProcess(): Promise<{
    process: AutomationProcess;
    scenario: AutomationScenario;
  } | null> {
    if (!resolvedEntityId || !resolvedTriggerFieldId) return null;

    // Prefer the store scenario (not draft-derived `scenario`, which is null
    // until a draft is seeded — that blocked Save/Undo on entities without a
    // prior edit session).
    if (process && storeScenario) {
      if (!draft || draft.scenario.id !== storeScenario.id) {
        const snap = makeSnap(storeScenario, templates);
        setDraft(snap);
        setSaved(cloneSnap(snap));
        setUndoStack([]);
        setSeededScenarioId(storeScenario.id);
      }
      return { process, scenario: storeScenario };
    }

    if (process && !storeScenario) {
      const next: AutomationScenario = {
        id: createAutomationScenarioId(),
        processId: process.id,
        name: "Основной",
        isDefault: true,
        entryConditions: emptyAutomationConditions(),
        priority: 0,
        canvasLayout: emptyAutomationCanvasLayout(),
        stageTransitions: [],
        stageTaskRelease: {},
      };
      await saveScenario(next);
      setScenarioId(next.id);
      const snap = makeSnap(next, []);
      setDraft(snap);
      setSaved(cloneSnap(snap));
      setUndoStack([]);
      setSeededScenarioId(next.id);
      return { process, scenario: next };
    }

    const created = createDefaultProcess({
      name: `${entity?.name ?? "Сущность"} · автоматизация`,
      entityId: resolvedEntityId,
      triggerFieldId: resolvedTriggerFieldId,
    });
    await saveProcess(created.process);
    await saveScenario(created.scenario);
    setStoredEntityId(resolvedEntityId);
    setStoredTriggerFieldId(resolvedTriggerFieldId || null);
    setScenarioId(created.scenario.id);
    const snap = makeSnap(created.scenario, []);
    setDraft(snap);
    setSaved(cloneSnap(snap));
    setUndoStack([]);
    setSeededScenarioId(created.scenario.id);
    return created;
  }

  // Seed a process/scenario as soon as the stage map is shown so canvas drags
  // can mark the draft dirty (Save / Undo / Revert). Without this, entities
  // that never had «+ задача» kept draft=null and updateDraft was a no-op.
  useEffect(() => {
    if (status !== "ready") return;
    if (!resolvedEntityId || !resolvedTriggerFieldId) return;
    if (stages.length === 0) return;
    if (draft && process && storeScenario) return;

    let cancelled = false;
    void ensureProcess().then((ensured) => {
      if (cancelled || !ensured) return;
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional seed on entity/field/map
  }, [
    status,
    resolvedEntityId,
    resolvedTriggerFieldId,
    stages.length,
    process?.id,
    storeScenarioId,
    draft?.scenario.id,
  ]);

  function openCreateScenarioDialog() {
    if (!confirmDiscardIfDirty()) return;
    setCreateScenarioSourceId("new");
    setCreateScenarioOpen(true);
  }

  async function confirmCreateScenario() {
    if (createScenarioBusy) return;
    setCreateScenarioBusy(true);
    try {
      const ensured = await ensureProcess();
      if (!ensured) return;

      const nextName = `Сценарий ${processScenarios.length + 1}`;

      if (createScenarioSourceId === "new") {
        const next: AutomationScenario = {
          id: createAutomationScenarioId(),
          processId: ensured.process.id,
          name: nextName,
          isDefault: false,
          entryConditions: emptyAutomationConditions(),
          priority: 10,
          canvasLayout: emptyAutomationCanvasLayout(),
          stageTransitions: [],
          stageTaskRelease: {},
        };
        await saveScenario(next);
        setScenarioId(next.id);
        const snap = makeSnap(next, []);
        setDraft(snap);
        setSaved(cloneSnap(snap));
        setUndoStack([]);
        setSelectedTemplateId(null);
        setInspectStageId(null);
        setEditorEpoch((epoch) => epoch + 1);
        setCreateScenarioOpen(false);
        return;
      }

      const source = processScenarios.find(
        (item) => item.id === createScenarioSourceId,
      );
      if (!source) {
        toast.error("Сценарий для копирования не найден");
        return;
      }

      const sourceTemplates = templates.filter(
        (item) => item.scenarioId === source.id,
      );
      const sourceRules = notificationRules.filter((rule) =>
        sourceTemplates.some((template) => template.id === rule.templateId),
      );
      const cloned = cloneAutomationScenario({
        source,
        sourceTemplates,
        sourceRules,
        name: nextName,
      });

      await saveScenario(cloned.scenario);
      for (const template of cloned.templates) {
        await saveTemplate(template);
      }
      for (const rule of cloned.notificationRules) {
        await saveNotificationRule(rule);
      }

      setScenarioId(cloned.scenario.id);
      const snap = makeSnap(cloned.scenario, [
        ...templates,
        ...cloned.templates,
      ]);
      setDraft(snap);
      setSaved(cloneSnap(snap));
      setUndoStack([]);
      setSelectedTemplateId(null);
      setInspectStageId(null);
      setEditorEpoch((epoch) => epoch + 1);
      setCreateScenarioOpen(false);
      toast.success(`Сценарий скопирован из «${source.name}»`);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Не удалось создать сценарий";
      console.error("[automation] create scenario failed", error);
      toast.error(message);
    } finally {
      setCreateScenarioBusy(false);
    }
  }

  function requestDeleteScenario(item: AutomationScenario) {
    if (item.isDefault) return;
    const isActive = scenarioId === item.id || storeScenario?.id === item.id;
    if (isActive && !confirmDiscardIfDirty()) return;
    setDeleteScenarioTarget(item);
  }

  async function confirmDeleteScenario() {
    const target = deleteScenarioTarget;
    if (!target || target.isDefault) return;

    const isActive =
      scenarioId === target.id || storeScenario?.id === target.id;
    const fallback =
      processScenarios.find(
        (item) => item.isDefault && item.id !== target.id,
      ) ??
      processScenarios.find((item) => item.id !== target.id) ??
      null;

    try {
      await removeScenario(target.id);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Не удалось удалить сценарий";
      toast.error(message);
      throw error;
    }

    if (isActive) {
      if (fallback) {
        setScenarioId(fallback.id);
        const snap = makeSnap(fallback, templates);
        setDraft(snap);
        setSaved(cloneSnap(snap));
        setUndoStack([]);
        setSelectedTemplateId(null);
        setInspectStageId(null);
        setEditorEpoch((epoch) => epoch + 1);
      } else {
        setScenarioId(null);
        setDraft(null);
        setSaved(null);
        setUndoStack([]);
      }
    }

    toast.success(`Сценарий «${target.name}» удалён`);
  }

  async function addTemplate(
    stageOptionId?: string,
    launchPhase: AutomationLaunchPhase = "onEnter",
    insertAt?: number,
    position?: { x: number; y: number },
  ) {
    const targetStageId = stageOptionId ?? activeStageId;
    if (!targetStageId) return;
    const ensured = await ensureProcess();
    if (!ensured) return;

    const templateId = createAutomationTemplateId();
    updateDraft((prev) => {
      const base =
        prev.scenario.id === ensured.scenario.id
          ? prev
          : makeSnap(ensured.scenario, []);
      const phaseList = base.templates
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
      const triggerFieldId = ensured.process.triggerFieldId?.trim() ?? "";
      const baseOutcomes = defaultDecisionOutcomes();
      const outcomes =
        launchPhase === "beforeEnter" && triggerFieldId
          ? baseOutcomes.map((outcome) => ({
              ...outcome,
              actions: withOutcomeStageAction(
                outcome.actions,
                triggerFieldId,
                targetStageId,
              ),
            }))
          : baseOutcomes;
      const template: AutomationTaskTemplate = {
        id: templateId,
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
        watchers: defaultWatcherResolver(),
        outcomes,
        sla: null,
        materials: [],
      };
      phaseList.splice(at, 0, template);
      const reorderedIds = new Set(phaseList.map((item) => item.id));
      const others = base.templates.filter(
        (item) => !reorderedIds.has(item.id),
      );
      const reordered = phaseList.map((item, index) => ({
        ...item,
        stepOrder: index,
        launchPhase,
      }));
      const positions: AutomationCanvasNodePositions = {
        ...base.scenario.canvasLayout.positions,
      };
      if (
        position &&
        Number.isFinite(position.x) &&
        Number.isFinite(position.y)
      ) {
        positions[templateId] = { x: position.x, y: position.y };
      }
      return {
        scenario: {
          ...base.scenario,
          canvasLayout: {
            ...base.scenario.canvasLayout,
            positions,
          },
        },
        templates: [...others, ...reordered],
      };
    });

    setStageId(targetStageId);
    setSelectedTemplateId(templateId);
    setInspectStageId(null);
  }

  function moveTemplate(
    templateId: string,
    targetStageId: string,
    stepOrder: number,
    launchPhase: AutomationLaunchPhase = "onEnter",
  ) {
    updateDraft((prev) => {
      const moving = prev.templates.find((item) => item.id === templateId);
      if (!moving) return prev;

      const without = prev.templates.filter((item) => item.id !== templateId);
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

      const updates = new Map<string, AutomationTaskTemplate>();
      targetList.forEach((item, index) => {
        updates.set(item.id, {
          ...item,
          triggerOptionId: targetStageId,
          launchPhase,
          stepOrder: index,
        });
      });

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
          updates.set(item.id, { ...item, stepOrder: index });
        });
      }

      return {
        ...prev,
        templates: prev.templates.map((item) => updates.get(item.id) ?? item),
      };
    });
  }

  function applyTemplate(next: AutomationTaskTemplate) {
    updateDraft((prev) => ({
      ...prev,
      templates: prev.templates.map((item) =>
        item.id === next.id ? next : item,
      ),
    }));
  }

  function deleteTemplate(templateId: string) {
    updateDraft((prev) => ({
      ...prev,
      templates: prev.templates.filter((item) => item.id !== templateId),
    }));
    setSelectedTemplateId(null);
  }

  function applyStageTransition(transition: AutomationStageTransition) {
    if (!assertCanMapFromStage(transition.fromOptionId)) return;
    updateDraft((prev) => {
      const current = prev.scenario.stageTransitions ?? [];
      const next = [
        ...current.filter(
          (item) =>
            item.id !== transition.id &&
            !(
              item.fromOptionId === transition.fromOptionId &&
              item.toOptionId === transition.toOptionId
            ),
        ),
        transition,
      ];
      return {
        ...prev,
        scenario: { ...prev.scenario, stageTransitions: next },
      };
    });
    setInspectStageId(transition.fromOptionId);
    setInspectToOptionId(transition.toOptionId);
  }

  function clearStageTransition(fromOptionId: string, toOptionId: string) {
    updateDraft((prev) => ({
      ...prev,
      scenario: {
        ...prev.scenario,
        stageTransitions: prev.scenario.stageTransitions.filter(
          (item) =>
            !(
              item.fromOptionId === fromOptionId &&
              item.toOptionId === toOptionId
            ),
        ),
      },
    }));
  }

  /** Drag-connect «тогда»: create rule or open existing. */
  function connectThenStages(fromOptionId: string, toOptionId: string) {
    if (!fromOptionId || !toOptionId || fromOptionId === toOptionId) return;
    if (!assertCanMapFromStage(fromOptionId)) return;
    const existing = findStageTransition(
      scenario?.stageTransitions ?? [],
      fromOptionId,
      toOptionId,
    );
    if (existing) {
      openStageTransition(fromOptionId, toOptionId);
      return;
    }
    applyStageTransition({
      id: createAutomationStageTransitionId(),
      fromOptionId,
      toOptionId,
      conditions: emptyAutomationConditions(),
      elseOptionId: "",
    });
    openStageTransition(fromOptionId, toOptionId);
  }

  /**
   * Drag-connect «иначе»: attach to selected / sole outgoing then-rule.
   * Without a then-rule, open the inspector so the user can set «тогда» first.
   */
  function connectElseStages(fromOptionId: string, elseOptionId: string) {
    if (!fromOptionId || !elseOptionId || fromOptionId === elseOptionId) return;
    if (!assertCanMapFromStage(fromOptionId)) return;
    const outgoing = (scenario?.stageTransitions ?? []).filter(
      (item) => item.fromOptionId === fromOptionId,
    );
    if (outgoing.length === 0) {
      toast.message("Сначала соедините «тогда»", {
        description:
          "Протяните зелёную точку к целевой стадии, затем янтарную — для «иначе».",
      });
      openStageTransition(fromOptionId);
      return;
    }

    const selected =
      inspectStageId === fromOptionId && inspectToOptionId
        ? outgoing.find((item) => item.toOptionId === inspectToOptionId)
        : undefined;
    const target =
      selected ?? (outgoing.length === 1 ? outgoing[0] : undefined);

    if (!target) {
      toast.message("Выберите переход «тогда»", {
        description:
          "Кликните по линии «тогда», затем соедините «иначе», или задайте ветку в панели.",
      });
      openStageTransition(fromOptionId, outgoing[0]?.toOptionId);
      return;
    }

    if (target.toOptionId === elseOptionId) {
      toast.message("«Иначе» не может совпадать с «тогда»");
      openStageTransition(fromOptionId, target.toOptionId);
      return;
    }

    applyStageTransition({
      ...target,
      elseOptionId,
    });
    if (target.conditions.rules.length === 0) {
      toast.message("Добавьте условия для ветки «иначе»", {
        description:
          "Без условий переход «тогда» всегда разрешён — «иначе» не сработает.",
      });
    }
    openStageTransition(fromOptionId, target.toOptionId);
  }

  function reconnectThenStages(
    fromOptionId: string,
    oldToOptionId: string,
    newToOptionId: string,
  ) {
    if (
      !fromOptionId ||
      !oldToOptionId ||
      !newToOptionId ||
      fromOptionId === newToOptionId
    ) {
      return;
    }
    if (!assertCanMapFromStage(fromOptionId)) return;
    const existing = findStageTransition(
      scenario?.stageTransitions ?? [],
      fromOptionId,
      oldToOptionId,
    );
    if (!existing) {
      // Placeholder neighbour edge → create a real rule at the new target.
      connectThenStages(fromOptionId, newToOptionId);
      return;
    }
    if (oldToOptionId === newToOptionId) {
      openStageTransition(fromOptionId, newToOptionId);
      return;
    }
    const collision = findStageTransition(
      scenario?.stageTransitions ?? [],
      fromOptionId,
      newToOptionId,
    );
    if (collision && collision.id !== existing.id) {
      toast.message("Переход на эту стадию уже есть");
      openStageTransition(fromOptionId, newToOptionId);
      return;
    }
    updateDraft((prev) => {
      const current = prev.scenario.stageTransitions ?? [];
      const next = current.map((item) => {
        if (item.id !== existing.id) return item;
        return {
          ...item,
          toOptionId: newToOptionId,
          elseOptionId:
            item.elseOptionId === newToOptionId ? "" : item.elseOptionId,
        };
      });
      return {
        ...prev,
        scenario: { ...prev.scenario, stageTransitions: next },
      };
    });
    openStageTransition(fromOptionId, newToOptionId);
  }

  function reconnectElseStages(
    fromOptionId: string,
    thenOptionId: string,
    newElseOptionId: string,
  ) {
    if (
      !fromOptionId ||
      !thenOptionId ||
      !newElseOptionId ||
      fromOptionId === newElseOptionId ||
      thenOptionId === newElseOptionId
    ) {
      return;
    }
    if (!assertCanMapFromStage(fromOptionId)) return;
    const existing = findStageTransition(
      scenario?.stageTransitions ?? [],
      fromOptionId,
      thenOptionId,
    );
    if (!existing) {
      openStageTransition(fromOptionId, thenOptionId);
      return;
    }
    applyStageTransition({
      ...existing,
      elseOptionId: newElseOptionId,
    });
  }

  function deleteThenStages(fromOptionId: string, toOptionId: string) {
    clearStageTransition(fromOptionId, toOptionId);
    if (inspectStageId === fromOptionId && inspectToOptionId === toOptionId) {
      closeStageInspector();
    }
  }

  function deleteElseStages(fromOptionId: string, toOptionId: string) {
    const existing = findStageTransition(
      scenario?.stageTransitions ?? [],
      fromOptionId,
      toOptionId,
    );
    if (!existing || !existing.elseOptionId) return;
    applyStageTransition({
      ...existing,
      elseOptionId: "",
    });
  }

  function setStageTaskRelease(
    stageOptionId: string,
    mode: AutomationStageTaskRelease,
  ) {
    updateDraft((prev) => {
      const current = prev.scenario.stageTaskRelease ?? {};
      if (mode === "parallel") {
        if (!(stageOptionId in current)) return prev;
        const next = { ...current };
        delete next[stageOptionId];
        return {
          ...prev,
          scenario: { ...prev.scenario, stageTaskRelease: next },
        };
      }
      if (current[stageOptionId] === mode) return prev;
      return {
        ...prev,
        scenario: {
          ...prev.scenario,
          stageTaskRelease: { ...current, [stageOptionId]: mode },
        },
      };
    });
  }

  function selectEntity(nextId: string) {
    if (!confirmDiscardIfDirty()) return;
    setStoredEntityId(nextId);
    const nextEntity = entities.find((item) => item.id === nextId);
    const nextLists =
      nextEntity?.fields.filter((field) => field.type === "list") ?? [];
    const existing = processes.find((item) => item.entityId === nextId);
    const nextField = existing?.triggerFieldId ?? nextLists[0]?.id ?? "";
    setStoredTriggerFieldId(nextField || null);
    setScenarioId(null);
    setStageId(null);
    setSelectedTemplateId(null);
    setInspectStageId(null);
    setDraft(null);
    setSaved(null);
    setUndoStack([]);
  }

  function selectField(nextFieldId: string) {
    if (!confirmDiscardIfDirty()) return;
    setStoredTriggerFieldId(nextFieldId);
    setScenarioId(null);
    setStageId(null);
    setSelectedTemplateId(null);
    setInspectStageId(null);
    setDraft(null);
    setSaved(null);
    setUndoStack([]);
  }

  const editActionsOverlay = showEditActions ? (
    <div
      className="pointer-events-none absolute top-3 left-3 z-30"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border/80 bg-card/95 p-1 shadow-sm backdrop-blur-sm">
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5 px-2.5"
          disabled={!dirty || persisting}
          onClick={() => void persistDraft()}
        >
          <Save className="size-3.5" aria-hidden />
          {persisting ? "Сохранение…" : "Сохранить"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-2.5"
          disabled={!canUndo || persisting}
          title="Отменить последнее изменение"
          onClick={undoEdit}
        >
          <Undo2 className="size-3.5" aria-hidden />
          Отменить
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-muted-foreground"
          disabled={!dirty || persisting}
          title="Откатить все несохранённые изменения"
          onClick={revertAll}
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Откатить
        </Button>
      </div>
    </div>
  ) : null;

  const toolbar = (
    <div className="flex shrink-0 items-center gap-2">
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
          if (next == null) return;
          if (!confirmDiscardIfDirty()) return;
          const nextId = String(next);
          const nextScenario = processScenarios.find(
            (item) => item.id === nextId,
          );
          setScenarioId(nextId);
          setSelectedTemplateId(null);
          setInspectStageId(null);
          if (nextScenario) {
            const snap = makeSnap(nextScenario, templates);
            setDraft(snap);
            setSaved(cloneSnap(snap));
            setUndoStack([]);
            setEditorEpoch((epoch) => epoch + 1);
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
              <SelectItem
                key={item.id}
                value={item.id}
                trailing={
                  item.isDefault ? undefined : (
                    <button
                      type="button"
                      aria-label={`Удалить сценарий «${item.name}»`}
                      title="Удалить сценарий"
                      className="flex size-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-destructive"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        requestDeleteScenario(item);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )
                }
              >
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
        onClick={openCreateScenarioDialog}
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
                updateDraft((prev) => ({
                  ...prev,
                  scenario: { ...prev.scenario, entryConditions },
                }))
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
        <div className="relative flex min-w-0 items-center">
          <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {leading}
          </div>
        </div>
        <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/30" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Dialog
        open={createScenarioOpen}
        onOpenChange={(open) => {
          if (createScenarioBusy) return;
          setCreateScenarioOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новый сценарий</DialogTitle>
            <DialogDescription>
              Создайте пустой сценарий или скопируйте задачи и настройки из
              существующего.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="create-scenario-source">Источник</Label>
            <Select
              value={createScenarioSourceId}
              onValueChange={(next) => {
                if (next == null) return;
                setCreateScenarioSourceId(String(next) as string | "new");
              }}
            >
              <SelectTrigger id="create-scenario-source" className="w-full">
                <SelectValue>
                  {createScenarioSourceId === "new"
                    ? "Создать новый (пустой)"
                    : (processScenarios.find(
                        (item) => item.id === createScenarioSourceId,
                      )?.name ?? "Сценарий")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Создать новый (пустой)</SelectItem>
                {processScenarios.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    Скопировать «{item.name}»
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={createScenarioBusy}
              onClick={() => setCreateScenarioOpen(false)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              disabled={createScenarioBusy}
              onClick={() => void confirmCreateScenario()}
            >
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteScenarioTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteScenarioTarget(null);
        }}
        title="Удалить сценарий?"
        description={
          deleteScenarioTarget
            ? `Сценарий «${deleteScenarioTarget.name}» и все его задачи будут удалены. Это действие нельзя отменить.`
            : ""
        }
        confirmLabel="Удалить"
        onConfirm={confirmDeleteScenario}
      />

      <div className="flex min-h-9 min-w-0 items-center">
        <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {leading}
        </div>
        <div className="relative z-10 shrink-0 bg-background pl-2">
          {toolbar}
        </div>
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
                stageTaskRelease={scenario?.stageTaskRelease ?? {}}
                activeStageId={activeStageId}
                selectedTemplateId={selectedTemplateId}
                selectedTransitionKey={selectedTransitionKey}
                canvasPositions={canvasLayout.positions}
                collapsedStageIds={collapsedStageIds}
                fields={entity?.fields ?? []}
                onSelectStage={(id) => {
                  if (!id) {
                    closeStageInspector();
                    return;
                  }
                  openStageTransition(id);
                }}
                onSelectTemplate={(id) => {
                  setSelectedTemplateId(id);
                  if (id) closeStageInspector();
                }}
                onSelectTransition={(fromOptionId, toOptionId) => {
                  openStageTransition(fromOptionId, toOptionId);
                }}
                onConnectThen={connectThenStages}
                onConnectElse={connectElseStages}
                onReconnectThen={reconnectThenStages}
                onReconnectElse={reconnectElseStages}
                onDeleteThen={deleteThenStages}
                onDeleteElse={deleteElseStages}
                onTaskReleaseChange={setStageTaskRelease}
                onAdd={(stageOptionId, launchPhase, insertAt, position) =>
                  void addTemplate(
                    stageOptionId,
                    launchPhase,
                    insertAt,
                    position,
                  )
                }
                onMoveTemplate={(
                  templateId,
                  stageOptionId,
                  stepOrder,
                  launchPhase,
                ) =>
                  moveTemplate(
                    templateId,
                    stageOptionId,
                    stepOrder,
                    launchPhase,
                  )
                }
                onCanvasPositionsChange={(positions) =>
                  patchCanvasLayout({ positions })
                }
                onToggleStageCollapse={toggleStageCollapse}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                У поля стадии нет вариантов
              </div>
            )}
            {editActionsOverlay}
          </main>

          {inspectFromStage && !selectedTemplate && entity ? (
            <aside
              className="relative z-20 hidden h-full min-h-0 w-[min(34rem,40vw)] min-w-[28rem] shrink-0 flex-col overflow-hidden border-l border-border bg-card xl:flex"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="flex min-h-0 flex-1 flex-col p-4">
                {isEntityListOptionFinal(inspectFromStage) ? (
                  <FinalStageInspector
                    key={`final:${inspectFromStage.id}:${editorEpoch}`}
                    stage={inspectFromStage}
                    orphanCount={
                      (scenario?.stageTransitions ?? []).filter(
                        (item) => item.fromOptionId === inspectFromStage.id,
                      ).length
                    }
                    onClearOrphans={() => {
                      clearOutgoingFromStage(inspectFromStage.id);
                    }}
                    onClose={closeStageInspector}
                  />
                ) : inspectToStage ? (
                  <StageTransitionInspector
                    key={`${inspectFromStage.id}\0${inspectToStage.id}:${editorEpoch}`}
                    fromStage={inspectFromStage}
                    toStage={inspectToStage}
                    stages={stages}
                    entity={entity}
                    value={inspectTransition}
                    onSave={async (transition) => {
                      applyStageTransition(transition);
                    }}
                    onClear={() => {
                      clearStageTransition(
                        inspectFromStage.id,
                        inspectTransition?.toOptionId ?? inspectToStage.id,
                      );
                      closeStageInspector();
                    }}
                    onClose={closeStageInspector}
                  />
                ) : (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border pb-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                            <GitBranch className="size-4" aria-hidden />
                          </span>
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold">
                              Переход дальше
                            </h3>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {inspectFromStage.name}
                            </p>
                          </div>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        onClick={closeStageInspector}
                      >
                        Закрыть
                      </Button>
                    </div>
                    <div className="flex flex-1 items-center justify-center px-2 py-8 text-center">
                      <p className="text-sm text-muted-foreground">
                        Нужна хотя бы ещё одна стадия, чтобы настроить переход.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </aside>
          ) : selectedTemplate && entity ? (
            <aside
              className="relative z-20 hidden h-full min-h-0 w-[min(34rem,40vw)] min-w-[28rem] shrink-0 flex-col overflow-hidden border-l border-border bg-card xl:flex"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="flex min-h-0 flex-1 flex-col p-4">
                <TemplateInspector
                  key={`${selectedTemplate.id}:${editorEpoch}`}
                  template={selectedTemplate}
                  entity={entity}
                  entities={entities}
                  options={stages}
                  triggerFieldId={resolvedTriggerFieldId}
                  notificationRules={notificationRules.filter(
                    (rule) => rule.templateId === selectedTemplate.id,
                  )}
                  commitLabel="Применить"
                  commitSuccessMessage="Изменения применены"
                  onSave={(next) => applyTemplate(next)}
                  onDelete={() => deleteTemplate(selectedTemplate.id)}
                />
              </div>
            </aside>
          ) : null}
        </div>
      )}
    </div>
  );
}
