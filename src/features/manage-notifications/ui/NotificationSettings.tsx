import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Layers3, ListTodo, Plus } from "lucide-react";
import {
  createDefaultNotificationRule,
  describeNotificationTrigger,
  removeNotificationRule,
  saveNotificationRule,
  sendNotification,
  useNotificationConfig,
  useNotificationStatus,
  type NotificationRule,
} from "@/entities/notification";
import {
  useAutomationConfig,
  useAutomationStatus,
} from "@/entities/automation";
import { findSystemUserByAuthId, useEntityConfig } from "@/entities/entity";
import { useSessionUser } from "@/entities/session";
import { Button } from "@/shared/ui/button";
import { Switch } from "@/shared/ui/switch";
import { TreeBranchRow } from "@/shared/ui/tree-branch-guides";
import { cn } from "@/shared/lib/cn";
import { pluralRu } from "@/shared/lib/plural";
import {
  buildNotificationRegistry,
  countRegistryNotifications,
  type RegistryEntity,
  type RegistryTask,
} from "../model/notification-registry";
import { AutomationTaskNotificationsPanel } from "./AutomationTaskNotificationsPanel";
import { NotificationRuleEditor } from "./NotificationRuleEditor";

type Selection =
  | { kind: "entity-rule"; id: string }
  | { kind: "task"; templateId: string }
  | { kind: "automation-rule"; templateId: string; ruleId: string };

function toggleId(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function revealSelectionPath(
  registry: readonly RegistryEntity[],
  selection: Selection,
): {
  entityId: string;
  stageKey?: string;
  templateId?: string;
} | null {
  for (const entity of registry) {
    if (selection.kind === "entity-rule") {
      if (entity.entityRules.some((rule) => rule.id === selection.id)) {
        return { entityId: entity.entityId };
      }
      continue;
    }
    for (const stage of entity.stages) {
      for (const task of stage.tasks) {
        if (task.templateId !== selection.templateId) continue;
        if (
          selection.kind === "automation-rule" &&
          !task.rules.some(({ rule }) => rule.id === selection.ruleId)
        ) {
          // Still reveal the task even if rule list is momentarily stale.
        }
        return {
          entityId: entity.entityId,
          stageKey: `${entity.entityId}:${stage.stageKey}`,
          templateId: task.templateId,
        };
      }
    }
  }
  return null;
}

function RegistryRowButton({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "hover:bg-muted/60 text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

function ExpandChevron({
  open,
  onClick,
  label,
}: {
  open: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/80 hover:text-foreground"
    >
      <ChevronDown
        className={cn(
          "size-3.5 transition-transform duration-150",
          open && "rotate-180",
        )}
        aria-hidden
      />
    </button>
  );
}

function findTask(
  registry: readonly RegistryEntity[],
  templateId: string,
): RegistryTask | null {
  for (const entity of registry) {
    for (const stage of entity.stages) {
      for (const task of stage.tasks) {
        if (task.templateId === templateId) return task;
      }
    }
  }
  return null;
}

export function NotificationSettings({ leading }: { leading?: ReactNode }) {
  const { rules } = useNotificationConfig();
  const status = useNotificationStatus();
  const automationStatus = useAutomationStatus();
  const { processes, scenarios, templates, notificationRules } =
    useAutomationConfig();
  const { entities } = useEntityConfig();
  const sessionUser = useSessionUser();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [busy, setBusy] = useState(false);
  const [expandedEntityIds, setExpandedEntityIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedStageKeys, setExpandedStageKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [didInitExpand, setDidInitExpand] = useState(false);

  const registry = useMemo(
    () =>
      buildNotificationRegistry({
        entities,
        processes,
        scenarios,
        templates,
        automationRules: notificationRules,
        entityRules: rules,
      }),
    [entities, processes, scenarios, templates, notificationRules, rules],
  );

  const visibleExpandedEntityIds = useMemo(() => {
    if (expandedEntityIds.size > 0) return expandedEntityIds;
    if (!didInitExpand && registry[0]) {
      return new Set([registry[0].entityId]);
    }
    return expandedEntityIds;
  }, [didInitExpand, expandedEntityIds, registry]);

  function selectInRegistry(next: Selection) {
    setSelection(next);
    const path = revealSelectionPath(registry, next);
    if (!path) return;
    setDidInitExpand(true);
    setExpandedEntityIds((current) => new Set(current).add(path.entityId));
    if (path.stageKey) {
      setExpandedStageKeys((current) => new Set(current).add(path.stageKey!));
    }
    if (path.templateId) {
      setExpandedTaskIds((current) => new Set(current).add(path.templateId!));
    }
  }

  const selectedEntityRule =
    selection?.kind === "entity-rule"
      ? (rules.find((rule) => rule.id === selection.id) ?? null)
      : null;

  const selectedTask =
    selection &&
    (selection.kind === "task" || selection.kind === "automation-rule")
      ? findTask(registry, selection.templateId)
      : null;

  const highlightRuleId =
    selection?.kind === "automation-rule" ? selection.ruleId : null;

  const isLoading = status === "loading" || automationStatus === "loading";

  async function handleAddEntityRule(entityId?: string) {
    const targetEntityId = entityId ?? entities[0]?.id;
    if (!targetEntityId) return;
    const rule = createDefaultNotificationRule(targetEntityId);
    setBusy(true);
    try {
      await saveNotificationRule(rule);
      setDidInitExpand(true);
      setExpandedEntityIds((current) => new Set(current).add(targetEntityId));
      selectInRegistry({ kind: "entity-rule", id: rule.id });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEntityRule(rule: NotificationRule) {
    setBusy(true);
    try {
      await saveNotificationRule(rule);
      selectInRegistry({ kind: "entity-rule", id: rule.id });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteEntityRule(ruleId: string) {
    setBusy(true);
    try {
      await removeNotificationRule(ruleId);
      setSelection(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleTest(rule: NotificationRule) {
    if (!sessionUser) return;
    const userRecord = findSystemUserByAuthId(entities, sessionUser.id);
    const userId = userRecord?.id ?? sessionUser.id;
    await sendNotification({
      userId,
      title: rule.titleTemplate || rule.name || "Тест уведомления",
      message:
        rule.messageTemplate ||
        `Тестовое уведомление: ${rule.name || "без названия"}`,
      source: "action",
      ruleId: rule.id,
      entityId: rule.entityId,
      showToast: rule.showToast,
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="sticky top-0 z-20 -mx-1 min-w-0 overflow-x-auto overscroll-x-contain bg-background px-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {leading}
      </div>
      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row">
        <div className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card lg:w-[22rem]">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div>
              <p className="text-sm font-semibold">Реестр уведомлений</p>
              <p className="text-[11px] text-muted-foreground">
                Сущность → стадия → задание → правило
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || entities.length === 0}
              onClick={() => void handleAddEntityRule()}
              title="Правило по записи сущности"
            >
              <Plus className="size-3.5" />
              Правило
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {isLoading ? (
              <div className="h-24 animate-pulse rounded-lg bg-muted/40" />
            ) : registry.length === 0 ? (
              <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                Пока нет сущностей с заданиями или правилами. Создайте
                автоматизацию или добавьте правило записи.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {registry.map((entity) => (
                  <RegistryEntityNode
                    key={entity.entityId}
                    entity={entity}
                    selection={selection}
                    expanded={visibleExpandedEntityIds.has(entity.entityId)}
                    expandedStageKeys={expandedStageKeys}
                    expandedTaskIds={expandedTaskIds}
                    onToggleEntity={() => {
                      setDidInitExpand(true);
                      setExpandedEntityIds((current) => {
                        const base =
                          current.size > 0 ? current : visibleExpandedEntityIds;
                        return toggleId(base, entity.entityId);
                      });
                    }}
                    onToggleStage={(stageKey) =>
                      setExpandedStageKeys((current) =>
                        toggleId(current, `${entity.entityId}:${stageKey}`),
                      )
                    }
                    onToggleTask={(templateId) =>
                      setExpandedTaskIds((current) =>
                        toggleId(current, templateId),
                      )
                    }
                    onSelect={selectInRegistry}
                    onToggleEntityRule={(rule, enabled) => {
                      void handleSaveEntityRule({ ...rule, enabled });
                    }}
                    onAddEntityRule={() =>
                      void handleAddEntityRule(entity.entityId)
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          {selectedEntityRule ? (
            <NotificationRuleEditor
              key={selectedEntityRule.id}
              rule={selectedEntityRule}
              entities={entities}
              onSave={(rule) => void handleSaveEntityRule(rule)}
              onDelete={() =>
                void handleDeleteEntityRule(selectedEntityRule.id)
              }
              onTest={(rule) => void handleTest(rule)}
            />
          ) : selectedTask ? (
            <AutomationTaskNotificationsPanel
              key={selectedTask.templateId}
              task={selectedTask}
              highlightRuleId={highlightRuleId}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <Layers3
                className="size-8 text-muted-foreground/45"
                aria-hidden
              />
              <p className="text-sm font-medium">Выберите узел в реестре</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Откройте сущность, стадию и задание — справа появятся
                уведомления этого задания. Правила записи редактируются из ветки
                «Правила записи».
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RegistryEntityNode({
  entity,
  selection,
  expanded,
  expandedStageKeys,
  expandedTaskIds,
  onToggleEntity,
  onToggleStage,
  onToggleTask,
  onSelect,
  onToggleEntityRule,
  onAddEntityRule,
}: {
  entity: RegistryEntity;
  selection: Selection | null;
  expanded: boolean;
  expandedStageKeys: Set<string>;
  expandedTaskIds: Set<string>;
  onToggleEntity: () => void;
  onToggleStage: (stageKey: string) => void;
  onToggleTask: (templateId: string) => void;
  onSelect: (selection: Selection) => void;
  onToggleEntityRule: (rule: NotificationRule, enabled: boolean) => void;
  onAddEntityRule: () => void;
}) {
  const total = countRegistryNotifications(entity);
  const totalLabel =
    total > 0
      ? `${total} ${pluralRu(total, "уведомление", "уведомления", "уведомлений")}`
      : "Нет уведомлений";

  return (
    <li className="flex flex-col">
      <div className="flex min-w-0 items-center gap-0.5">
        <ExpandChevron
          open={expanded}
          onClick={onToggleEntity}
          label={expanded ? "Свернуть сущность" : "Развернуть сущность"}
        />
        <RegistryRowButton
          active={false}
          onClick={onToggleEntity}
          className="flex-1 py-2"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/35 text-muted-foreground">
            <Layers3 className="size-3.5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {entity.entityName}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {totalLabel}
              {entity.stages.length > 0
                ? ` · ${entity.stages.length} ${pluralRu(entity.stages.length, "стадия", "стадии", "стадий")}`
                : ""}
            </span>
          </span>
        </RegistryRowButton>
      </div>

      {expanded ? (
        <div className="flex flex-col pb-1">
          <TreeBranchRow isFirst isLast={entity.stages.length === 0}>
            <div className="flex flex-col gap-0.5 py-0.5">
              <div className="flex items-center justify-between gap-2 px-2 pt-1">
                <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Правила записи
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[11px]"
                  onClick={onAddEntityRule}
                >
                  <Plus className="size-3" />
                  Добавить
                </Button>
              </div>
              {entity.entityRules.length === 0 ? (
                <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                  Нет правил по полям записи
                </p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {entity.entityRules.map((rule) => {
                    const active =
                      selection?.kind === "entity-rule" &&
                      selection.id === rule.id;
                    return (
                      <li key={rule.id}>
                        <RegistryRowButton
                          active={active}
                          onClick={() =>
                            onSelect({ kind: "entity-rule", id: rule.id })
                          }
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">
                              {rule.name}
                            </span>
                            <span className="block truncate text-[10px] text-muted-foreground">
                              {describeNotificationTrigger(rule)}
                            </span>
                          </span>
                          <Switch
                            checked={rule.enabled}
                            onCheckedChange={(enabled) =>
                              onToggleEntityRule(rule, enabled)
                            }
                            onClick={(event) => event.stopPropagation()}
                          />
                        </RegistryRowButton>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </TreeBranchRow>

          {entity.stages.map((stage, stageIndex) => {
            const stageFullKey = `${entity.entityId}:${stage.stageKey}`;
            const stageOpen = expandedStageKeys.has(stageFullKey);
            const isLastStage = stageIndex === entity.stages.length - 1;
            return (
              <TreeBranchRow
                key={stage.stageKey}
                isFirst={false}
                isLast={isLastStage}
              >
                <div className="flex flex-col">
                  <div className="flex min-w-0 items-center gap-0.5">
                    <ExpandChevron
                      open={stageOpen}
                      onClick={() => onToggleStage(stage.stageKey)}
                      label={
                        stageOpen ? "Свернуть стадию" : "Развернуть стадию"
                      }
                    />
                    <RegistryRowButton
                      active={false}
                      onClick={() => onToggleStage(stage.stageKey)}
                      className="flex-1"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">
                          {stage.stageName}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {stage.tasks.length}{" "}
                          {pluralRu(
                            stage.tasks.length,
                            "задание",
                            "задания",
                            "заданий",
                          )}
                        </span>
                      </span>
                    </RegistryRowButton>
                  </div>

                  {stageOpen ? (
                    <div className="flex flex-col">
                      {stage.tasks.map((task, taskIndex) => {
                        const taskOpen = expandedTaskIds.has(task.templateId);
                        const taskActive =
                          (selection?.kind === "task" ||
                            selection?.kind === "automation-rule") &&
                          selection.templateId === task.templateId;
                        const isLastTask = taskIndex === stage.tasks.length - 1;
                        return (
                          <TreeBranchRow
                            key={task.templateId}
                            isFirst={taskIndex === 0}
                            isLast={isLastTask}
                            insetClassName="ml-3"
                          >
                            <div className="flex flex-col">
                              <div className="flex min-w-0 items-center gap-0.5">
                                <ExpandChevron
                                  open={taskOpen}
                                  onClick={() => onToggleTask(task.templateId)}
                                  label={
                                    taskOpen
                                      ? "Свернуть задание"
                                      : "Развернуть задание"
                                  }
                                />
                                <RegistryRowButton
                                  active={taskActive && !taskOpen}
                                  onClick={() => {
                                    onSelect({
                                      kind: "task",
                                      templateId: task.templateId,
                                    });
                                    if (!taskOpen) {
                                      onToggleTask(task.templateId);
                                    }
                                  }}
                                  className="flex-1"
                                >
                                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-muted-foreground">
                                    <ListTodo
                                      className="size-3.5"
                                      aria-hidden
                                    />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13px] font-medium">
                                      {task.label}
                                    </span>
                                    <span className="block truncate text-[10px] text-muted-foreground">
                                      {task.rules.length > 0
                                        ? `${task.rules.length} ${pluralRu(task.rules.length, "уведомление", "уведомления", "уведомлений")}`
                                        : "Нет уведомлений"}
                                    </span>
                                  </span>
                                </RegistryRowButton>
                              </div>

                              {taskOpen ? (
                                <div className="flex flex-col">
                                  {task.rules.length === 0 ? (
                                    <TreeBranchRow isFirst isLast>
                                      <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                                        Добавьте уведомление справа
                                      </p>
                                    </TreeBranchRow>
                                  ) : (
                                    task.rules.map(
                                      ({ rule, label }, ruleIndex) => {
                                        const active =
                                          selection?.kind ===
                                            "automation-rule" &&
                                          selection.ruleId === rule.id;
                                        return (
                                          <TreeBranchRow
                                            key={rule.id}
                                            isFirst={ruleIndex === 0}
                                            isLast={
                                              ruleIndex ===
                                              task.rules.length - 1
                                            }
                                            insetClassName="ml-3"
                                          >
                                            <RegistryRowButton
                                              active={active}
                                              onClick={() =>
                                                onSelect({
                                                  kind: "automation-rule",
                                                  templateId: task.templateId,
                                                  ruleId: rule.id,
                                                })
                                              }
                                            >
                                              <span className="truncate text-[12px] font-medium">
                                                {label}
                                              </span>
                                            </RegistryRowButton>
                                          </TreeBranchRow>
                                        );
                                      },
                                    )
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </TreeBranchRow>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </TreeBranchRow>
            );
          })}
        </div>
      ) : null}
    </li>
  );
}
