import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { SettingSwitch } from "@/shared/ui/setting-controls";
import {
  createAutomationNotificationRuleId,
  createAutomationOutcomeId,
  defaultAssigneeResolver,
  defaultAutofillOutcomes,
  defaultDecisionOutcomes,
  emptyAutomationConditions,
  automationRelationGroupsAskModeLabel,
  automationRelationGroupsAskModes,
  emptyAutomationOutcomeFieldAccess,
  getOutcomeStageOptionId,
  normalizeAutomationOutcomeFieldAccess,
  removeNotificationRule,
  saveNotificationRule,
  automationRequiresTimeTracking,
  getAutomationUploadTarget,
  setAutomationRequireTimeTracking,
  setAutomationUploadTarget,
  withOutcomeStageAction,
  withoutOutcomeStageAction,
  type AutomationAskRelatedField,
  type AutomationLaunchPhase,
  type AutomationNotificationRule,
  type AutomationOutcome,
  type AutomationOutcomeFieldAccess,
  type AutomationRelationGroupsAskMode,
  type AutomationTaskKind,
  type AutomationTaskTemplate,
  type AutomationTaskUploadTarget,
} from "@/entities/automation";
import { AssigneeEditor } from "@/entities/automation/ui/AssigneeEditor";
import {
  getEntityFieldDisplayName,
  getEntityRelationTargetId,
  isEntityComputedFieldType,
  isEntityFilesTab,
  isEntityRecordsTab,
  type Entity,
  type EntityField,
} from "@/entities/entity";
import {
  lockDragSelection,
  unlockDragSelection,
} from "@/shared/lib/drag-selection";
import { ActionPipelineEditor } from "./ActionPipelineEditor";
import { AutomationNotificationRuleEditor } from "./AutomationNotificationRuleEditor";
import { ConditionGroupBuilder } from "./ConditionGroupBuilder";
import { OutcomeAutofillEditor } from "./OutcomeAutofillEditor";
import { OutcomeButtonChip } from "./OutcomeButtonChip";
import { OutcomeRouteBranchesEditor } from "./OutcomeRouteBranchesEditor";
import { OutcomeStageSelect } from "./OutcomeStageSelect";
import { TemplateFieldInput } from "./TemplateFieldInput";
import { TemplateRichText } from "./TemplateRichText";
import { cn } from "@/shared/lib/cn";

const OUTCOME_FIELD_MIME = "application/x-ipk-outcome-field";

function createAskRelatedFieldId() {
  return `arel-${crypto.randomUUID()}`;
}

/** Writable fields for related-entity ask (no computed / structured JSON). */
function isAskRelatedTargetField(field: EntityField) {
  return (
    !isEntityComputedFieldType(field.type) &&
    field.type !== "file" &&
    field.type !== "dependencies" &&
    field.type !== "relationGroups" &&
    field.type !== "period"
  );
}

const fieldLayoutTransition = {
  type: "spring" as const,
  stiffness: 420,
  damping: 36,
  mass: 0.55,
};

const dropIndicatorTransition = {
  type: "spring" as const,
  stiffness: 520,
  damping: 32,
  mass: 0.4,
};

function reorderFieldIds(
  ids: string[],
  fieldId: string,
  beforeFieldId: string | null,
) {
  const without = ids.filter((id) => id !== fieldId);
  if (beforeFieldId == null) return [...without, fieldId];
  const index = without.indexOf(beforeFieldId);
  if (index < 0) return [...without, fieldId];
  return [...without.slice(0, index), fieldId, ...without.slice(index)];
}

function getDropEdge(event: DragEvent<HTMLElement>): "before" | "after" {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function setFieldDragPreview(event: DragEvent, source: HTMLElement) {
  const rect = source.getBoundingClientRect();
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.querySelectorAll("button, input, label").forEach((node) => {
    node.remove();
  });
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed",
    top: "-1000px",
    left: "-1000px",
    width: `${rect.width}px`,
    margin: "0",
    pointerEvents: "none",
    zIndex: "99999",
    opacity: "1",
    transform: "rotate(1deg)",
    boxShadow:
      "0 14px 32px -14px rgb(0 0 0 / 0.35), 0 0 0 1px color-mix(in oklab, var(--primary) 35%, transparent)",
    borderColor: "color-mix(in oklab, var(--primary) 45%, transparent)",
    background: "var(--card)",
  });
  document.body.appendChild(ghost);
  const offsetX = Math.min(
    Math.max(event.clientX - rect.left, 10),
    Math.max(rect.width - 10, 10),
  );
  const offsetY = Math.min(
    Math.max(event.clientY - rect.top, 10),
    Math.max(rect.height - 10, 10),
  );
  event.dataTransfer.setDragImage(ghost, offsetX, offsetY);
  requestAnimationFrame(() => {
    ghost.remove();
  });
}

function FieldDropIndicator({ edge }: { edge: "before" | "after" }) {
  return (
    <motion.span
      aria-hidden
      initial={{ opacity: 0, scaleX: 0.82 }}
      animate={{ opacity: 1, scaleX: 1 }}
      exit={{ opacity: 0, scaleX: 0.9 }}
      transition={dropIndicatorTransition}
      className={cn(
        "pointer-events-none absolute right-0 left-0 z-20 flex origin-left items-center",
        edge === "before"
          ? "top-0 -translate-y-1/2"
          : "bottom-0 translate-y-1/2",
      )}
    >
      <span className="relative flex size-2 shrink-0 items-center justify-center">
        <motion.span
          aria-hidden
          className="absolute size-2 rounded-full bg-primary/30"
          animate={{ scale: [1, 1.35, 1] }}
          transition={{
            duration: 0.9,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <span className="size-1.5 rounded-full bg-primary" />
      </span>
      <span className="h-0.5 min-w-0 flex-1 rounded-full bg-primary" />
    </motion.span>
  );
}

/** Red grab rail to the left of the field card (outside the border). */
function FieldDragHandle({
  label,
  active = false,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <span
      data-drag-handle
      className={cn(
        "relative z-10 flex w-2.5 shrink-0 touch-none items-center justify-center self-stretch select-none",
        active ? "cursor-grabbing" : "cursor-grab",
      )}
      aria-label={label}
      title={label}
      onPointerDown={() => {
        window.getSelection()?.removeAllRanges();
      }}
    >
      <span
        aria-hidden
        className={cn(
          "my-1 h-[calc(100%-0.5rem)] min-h-5 w-1 shrink-0 rounded-full bg-primary transition-[opacity,transform,box-shadow] duration-150",
          active
            ? "scale-y-105 opacity-100 shadow-[0_0_0_3px] shadow-primary/20"
            : "opacity-45 group-hover/field:opacity-90 group-focus-within/field:opacity-90",
        )}
      />
    </span>
  );
}

const KIND_LABELS: Record<AutomationTaskKind, string> = {
  decision: "Решение",
  single: "Одна кнопка",
  autofill: "Автозаполнение",
};

const UPLOAD_ROOT_VALUE = "__root__";

function TemplateUploadTargetSettings({
  entity,
  materials,
  onMaterialsChange,
}: {
  entity: Entity;
  materials: string[];
  onMaterialsChange: (materials: string[]) => void;
}) {
  const filesTabs = useMemo(
    () => entity.tabs.filter((tab) => isEntityFilesTab(tab)),
    [entity.tabs],
  );
  const target = getAutomationUploadTarget(materials);
  const enabled = target != null;
  const activeTab =
    filesTabs.find((tab) => tab.id === target?.filesTabId) ?? filesTabs[0];
  const folderOptions = activeTab?.defaultFolders ?? [];

  function patchTarget(next: AutomationTaskUploadTarget | null) {
    onMaterialsChange(setAutomationUploadTarget(materials, next));
  }

  function enableUpload(checked: boolean) {
    if (!checked) {
      patchTarget(null);
      return;
    }
    const tab = filesTabs[0];
    if (!tab) return;
    patchTarget({
      filesTabId: tab.id,
      folderId: tab.defaultFolders[0]?.id ?? "",
      required: false,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <InspectorSwitchRow>
        <SettingSwitch
          id="template-allow-upload"
          title="Загрузка в задании"
          description={
            filesTabs.length === 0
              ? "Нужна вкладка «Файлы» у сущности"
              : "Файлы попадут в выбранную папку записи"
          }
          checked={enabled}
          disabled={filesTabs.length === 0}
          onCheckedChange={enableUpload}
        />
      </InspectorSwitchRow>

      {enabled && activeTab ? (
        <div className="flex flex-col gap-3">
          {filesTabs.length > 1 ? (
            <Field title="Вкладка файлов">
              <Select
                value={activeTab.id}
                onValueChange={(next) => {
                  if (next == null) return;
                  const tabId = String(next);
                  const tab = filesTabs.find((item) => item.id === tabId);
                  if (!tab || !target) return;
                  patchTarget({
                    ...target,
                    filesTabId: tab.id,
                    folderId: tab.defaultFolders[0]?.id ?? "",
                  });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{activeTab.name}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {filesTabs.map((tab) => (
                    <SelectItem key={tab.id} value={tab.id}>
                      {tab.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          <Field title="Папка">
            <Select
              value={
                target?.folderId.trim() ? target.folderId : UPLOAD_ROOT_VALUE
              }
              onValueChange={(next) => {
                if (next == null || !target) return;
                const value = String(next);
                patchTarget({
                  ...target,
                  folderId: value === UPLOAD_ROOT_VALUE ? "" : value,
                });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {target?.folderId.trim()
                    ? (folderOptions.find((item) => item.id === target.folderId)
                        ?.name ?? "Папка")
                    : "Без папки (корень)"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UPLOAD_ROOT_VALUE}>
                  Без папки (корень)
                </SelectItem>
                {folderOptions.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: folder.color }}
                        aria-hidden
                      />
                      {folder.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <InspectorSwitchRow>
            <SettingSwitch
              id="template-upload-required"
              title="Обязательно для завершения"
              description="Без файла задание нельзя закрыть"
              checked={target?.required === true}
              onCheckedChange={(required) => {
                if (!target) return;
                patchTarget({ ...target, required });
              }}
            />
          </InspectorSwitchRow>
        </div>
      ) : null}
    </div>
  );
}

function outcomesForKind(
  kind: AutomationTaskKind,
  current: AutomationOutcome[],
): AutomationOutcome[] {
  if (kind === "autofill") {
    if (current.length === 0) return defaultAutofillOutcomes();
    return current.map((item, index, list) => {
      const isElse = index === list.length - 1;
      return {
        ...item,
        label: isElse
          ? "Иначе"
          : item.label.trim() && item.label !== "Иначе"
            ? item.label
            : "Если",
        fieldAccess: emptyAutomationOutcomeFieldAccess(),
        conditions: isElse
          ? emptyAutomationConditions()
          : (item.conditions ?? emptyAutomationConditions()),
      };
    });
  }
  if (kind === "single") {
    return current.length >= 1
      ? [
          {
            ...current[0]!,
            label: current[0]!.label.trim() || "Готово",
            conditions: current[0]!.conditions ?? emptyAutomationConditions(),
          },
        ]
      : [
          {
            id: createAutomationOutcomeId(),
            label: "Готово",
            color: null,
            actions: [],
            fieldAccess: emptyAutomationOutcomeFieldAccess(),
            conditions: emptyAutomationConditions(),
          },
        ];
  }
  return current.length >= 2
    ? current.map((item) => ({
        ...item,
        conditions: item.conditions ?? emptyAutomationConditions(),
      }))
    : defaultDecisionOutcomes();
}

/** Card-level block shared by every inspector tab. */
function InspectorSection({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-3.5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-2.5">
        <h4 className="min-w-0 truncate text-sm font-semibold text-foreground">
          {title}
        </h4>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-3">{children}</div>
    </div>
  );
}

/** Field label inside a section — muted, compact, same on every tab. */
function Field({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {title}
      </Label>
      {description ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          {description}
        </p>
      ) : null}
      {children}
    </div>
  );
}

function InspectorEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border/80 bg-muted/10 px-3 py-5 text-center text-xs text-muted-foreground">
      {children}
    </p>
  );
}

function InspectorSwitchRow({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
      {children}
    </div>
  );
}

function FieldFlagCheckbox({
  checked,
  disabled,
  label,
  title,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  title: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      data-no-drag
      title={title}
      className={cn(
        "flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-muted-foreground",
        checked && !disabled && "text-foreground",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type="checkbox"
        className="size-3 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function toggleIdList(ids: string[], fieldId: string, enabled: boolean) {
  if (enabled) {
    return ids.includes(fieldId) ? ids : [...ids, fieldId];
  }
  return ids.filter((id) => id !== fieldId);
}

/** Compact: only selected fields; add via select. Flags = checkboxes on the row. */
function OutcomeAskFieldsEditor({
  fields,
  entities,
  value,
  onChange,
  hasRecordsTab,
}: {
  fields: EntityField[];
  entities: Entity[];
  value: AutomationOutcomeFieldAccess;
  onChange: (next: AutomationOutcomeFieldAccess) => void;
  hasRecordsTab: boolean;
}) {
  const access = normalizeAutomationOutcomeFieldAccess(value);
  const entityById = new Map(entities.map((item) => [item.id, item]));
  const selected = access.visibleFieldIds
    .map((id) => fields.find((field) => field.id === id))
    .filter((field): field is EntityField => field != null);
  const available = fields.filter(
    (field) => !access.visibleFieldIds.includes(field.id),
  );
  const relationFields = fields.filter((field) => field.type === "relation");
  const relatedSelected = access.relatedVisibleFields;
  const usedRelatedKeys = new Set(
    relatedSelected.map((item) => `${item.relationFieldId}:${item.fieldId}`),
  );

  const relatedPickers = relationFields
    .map((relation) => {
      const targetId = getEntityRelationTargetId(relation);
      const target = targetId ? entityById.get(targetId) : undefined;
      if (!target) return null;
      const availableFields = target.fields.filter(
        (field) =>
          isAskRelatedTargetField(field) &&
          !usedRelatedKeys.has(`${relation.id}:${field.id}`),
      );
      if (availableFields.length === 0) return null;
      return {
        relation,
        target,
        availableFields,
      };
    })
    .filter(
      (
        item,
      ): item is {
        relation: EntityField;
        target: Entity;
        availableFields: EntityField[];
      } => item != null,
    );

  const canAddField = available.length > 0 || relatedPickers.length > 0;

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{
    beforeFieldId: string | null;
  } | null>(null);
  const dragLockedRef = useRef(false);
  const allowDragRef = useRef(false);

  function removeField(fieldId: string) {
    const restOptions = { ...access.fieldAskOptions };
    delete restOptions[fieldId];
    onChange({
      ...access,
      visibleFieldIds: access.visibleFieldIds.filter((id) => id !== fieldId),
      requiredFieldIds: access.requiredFieldIds.filter((id) => id !== fieldId),
      commentFieldIds: access.commentFieldIds.filter((id) => id !== fieldId),
      recordFieldIds: access.recordFieldIds.filter((id) => id !== fieldId),
      fieldAskOptions: restOptions,
    });
  }

  function setRelationGroupsMode(
    fieldId: string,
    mode: AutomationRelationGroupsAskMode,
  ) {
    const nextOptions = { ...access.fieldAskOptions };
    if (mode === "full") {
      const rest = { ...nextOptions };
      delete rest[fieldId];
      onChange({ ...access, fieldAskOptions: rest });
      return;
    }
    nextOptions[fieldId] = {
      ...nextOptions[fieldId],
      relationGroupsMode: mode,
    };
    onChange({ ...access, fieldAskOptions: nextOptions });
  }

  function setRequired(fieldId: string, required: boolean) {
    const field = fields.find((item) => item.id === fieldId);
    // Computed fields are derived — never mark them required.
    if (field && isEntityComputedFieldType(field.type)) return;
    onChange({
      ...access,
      requiredFieldIds: toggleIdList(
        access.requiredFieldIds,
        fieldId,
        required,
      ),
    });
  }

  function setComment(fieldId: string, enabled: boolean) {
    onChange({
      ...access,
      commentFieldIds: toggleIdList(access.commentFieldIds, fieldId, enabled),
    });
  }

  function setRecord(fieldId: string, enabled: boolean) {
    onChange({
      ...access,
      recordFieldIds: toggleIdList(access.recordFieldIds, fieldId, enabled),
    });
  }

  function addRelatedField(relationFieldId: string, fieldId: string) {
    const next: AutomationAskRelatedField = {
      id: createAskRelatedFieldId(),
      relationFieldId,
      fieldId,
    };
    onChange({
      ...access,
      relatedVisibleFields: [...access.relatedVisibleFields, next],
      relatedRecordIds: [...access.relatedRecordIds, next.id],
    });
  }

  function removeRelatedField(askId: string) {
    onChange({
      ...access,
      relatedVisibleFields: access.relatedVisibleFields.filter(
        (item) => item.id !== askId,
      ),
      relatedRequiredIds: access.relatedRequiredIds.filter(
        (id) => id !== askId,
      ),
      relatedCommentIds: access.relatedCommentIds.filter((id) => id !== askId),
      relatedRecordIds: access.relatedRecordIds.filter((id) => id !== askId),
    });
  }

  function setRelatedRequired(askId: string, required: boolean) {
    onChange({
      ...access,
      relatedRequiredIds: toggleIdList(
        access.relatedRequiredIds,
        askId,
        required,
      ),
    });
  }

  function setRelatedComment(askId: string, enabled: boolean) {
    onChange({
      ...access,
      relatedCommentIds: toggleIdList(access.relatedCommentIds, askId, enabled),
    });
  }

  function setRelatedRecord(askId: string, enabled: boolean) {
    onChange({
      ...access,
      relatedRecordIds: toggleIdList(access.relatedRecordIds, askId, enabled),
    });
  }

  function resolveRelatedRow(item: AutomationAskRelatedField) {
    const relation = fields.find((field) => field.id === item.relationFieldId);
    const targetId = relation ? getEntityRelationTargetId(relation) : null;
    const target = targetId ? entityById.get(targetId) : undefined;
    const targetField = target?.fields.find(
      (field) => field.id === item.fieldId,
    );
    return {
      relation,
      target,
      targetField,
      relationLabel: relation ? getEntityFieldDisplayName(relation) : "Связь",
      fieldLabel: targetField
        ? getEntityFieldDisplayName(targetField)
        : item.fieldId,
      hasRecordsTab: target?.tabs.some(isEntityRecordsTab) ?? false,
    };
  }

  function endDrag() {
    allowDragRef.current = false;
    setDraggingId(null);
    setDropHint(null);
    if (dragLockedRef.current) {
      unlockDragSelection();
      dragLockedRef.current = false;
    }
  }

  useEffect(() => {
    function onWindowDragEnd() {
      allowDragRef.current = false;
      setDraggingId(null);
      setDropHint(null);
      if (dragLockedRef.current) {
        unlockDragSelection();
        dragLockedRef.current = false;
      }
    }
    window.addEventListener("dragend", onWindowDragEnd);
    return () => {
      window.removeEventListener("dragend", onWindowDragEnd);
      if (dragLockedRef.current) {
        unlockDragSelection();
        dragLockedRef.current = false;
      }
    };
  }, []);

  function applyReorder(beforeFieldId: string | null) {
    if (!draggingId) return;
    const nextIds = reorderFieldIds(
      access.visibleFieldIds,
      draggingId,
      beforeFieldId,
    );
    const unchanged =
      nextIds.length === access.visibleFieldIds.length &&
      nextIds.every((id, index) => id === access.visibleFieldIds[index]);
    if (!unchanged) {
      onChange({ ...access, visibleFieldIds: nextIds });
    }
    endDrag();
  }

  return (
    <div className="rounded-lg border border-border/60 bg-background/80 p-3">
      <div className="flex h-7 items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Поля формы</p>
        {canAddField ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 border-dashed px-2 text-xs text-muted-foreground"
                />
              }
            >
              <Plus className="size-3 shrink-0" />
              Поле
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 min-w-52">
              {available.length > 0 ? (
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
                    Эта сущность
                  </DropdownMenuLabel>
                  {available.map((field) => (
                    <DropdownMenuItem
                      key={field.id}
                      onClick={() =>
                        onChange({
                          ...access,
                          visibleFieldIds: [
                            ...access.visibleFieldIds,
                            field.id,
                          ],
                          recordFieldIds: access.recordFieldIds.includes(
                            field.id,
                          )
                            ? access.recordFieldIds
                            : [...access.recordFieldIds, field.id],
                        })
                      }
                    >
                      {getEntityFieldDisplayName(field)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              ) : null}
              {available.length > 0 && relatedPickers.length > 0 ? (
                <DropdownMenuSeparator />
              ) : null}
              {relatedPickers.length > 0 ? (
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
                    Через связь
                  </DropdownMenuLabel>
                  {relatedPickers.map(
                    ({ relation, target, availableFields }) => (
                      <DropdownMenuSub key={relation.id}>
                        <DropdownMenuSubTrigger>
                          {getEntityFieldDisplayName(relation)}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="max-h-64 min-w-44">
                          <DropdownMenuGroup>
                            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                              {target.name}
                            </DropdownMenuLabel>
                            {availableFields.map((field) => (
                              <DropdownMenuItem
                                key={field.id}
                                onClick={() =>
                                  addRelatedField(relation.id, field.id)
                                }
                              >
                                {getEntityFieldDisplayName(field)}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuGroup>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    ),
                  )}
                </DropdownMenuGroup>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {selected.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">Нет полей</p>
      ) : (
        <LayoutGroup id="outcome-ask-fields">
          <ul className="mt-2 flex flex-col gap-1">
            {selected.map((field, index) => {
              const computed = isEntityComputedFieldType(field.type);
              const required =
                !computed && access.requiredFieldIds.includes(field.id);
              const toComments = access.commentFieldIds.includes(field.id);
              const toRecord = access.recordFieldIds.includes(field.id);
              const label = getEntityFieldDisplayName(field);
              const isDragging = draggingId === field.id;
              const dropEdge: "before" | "after" | null =
                dropHint == null || draggingId === field.id
                  ? null
                  : dropHint.beforeFieldId === field.id
                    ? "before"
                    : dropHint.beforeFieldId == null &&
                        index === selected.length - 1
                      ? "after"
                      : null;

              return (
                <li key={field.id} className="list-none">
                  <div
                    className="group/field relative"
                    draggable
                    onMouseDown={(event) => {
                      allowDragRef.current = Boolean(
                        event.target instanceof Element &&
                        event.target.closest("[data-drag-handle]"),
                      );
                      if (allowDragRef.current) {
                        window.getSelection()?.removeAllRanges();
                      }
                    }}
                    onDragStart={(event) => {
                      if (!allowDragRef.current) {
                        event.preventDefault();
                        return;
                      }
                      lockDragSelection();
                      dragLockedRef.current = true;
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData(OUTCOME_FIELD_MIME, field.id);
                      event.dataTransfer.setData("text/plain", field.id);
                      const preview =
                        event.currentTarget.querySelector<HTMLElement>(
                          "[data-outcome-field-card]",
                        );
                      if (preview) setFieldDragPreview(event, preview);
                      setDraggingId(field.id);
                      setDropHint(null);
                    }}
                    onDragEnd={endDrag}
                    onDragOver={(event) => {
                      if (draggingId == null || draggingId === field.id) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      const edge = getDropEdge(event);
                      const beforeFieldId =
                        edge === "before"
                          ? field.id
                          : (selected[index + 1]?.id ?? null);
                      setDropHint((prev) =>
                        prev?.beforeFieldId === beforeFieldId
                          ? prev
                          : { beforeFieldId },
                      );
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (draggingId == null || draggingId === field.id) {
                        endDrag();
                        return;
                      }
                      const edge = getDropEdge(event);
                      const beforeFieldId =
                        edge === "before"
                          ? field.id
                          : (selected[index + 1]?.id ?? null);
                      applyReorder(beforeFieldId);
                    }}
                  >
                    <motion.div
                      layout="position"
                      layoutId={`outcome-field-${field.id}`}
                      transition={fieldLayoutTransition}
                      className="relative flex items-stretch gap-0.5"
                    >
                      <FieldDragHandle
                        label={`Перетащить «${label}»`}
                        active={isDragging}
                      />
                      <div className="relative min-w-0 flex-1">
                        <AnimatePresence initial={false}>
                          {dropEdge ? (
                            <FieldDropIndicator key="drop" edge={dropEdge} />
                          ) : null}
                        </AnimatePresence>
                        {isDragging ? (
                          <div
                            aria-hidden
                            className="h-8 rounded border-2 border-dashed border-primary/35 bg-primary/[0.04]"
                          />
                        ) : (
                          <div
                            data-outcome-field-card
                            className="flex flex-col gap-1 rounded border border-border/50 bg-card px-2 py-1.5 transition-[border-color,box-shadow] duration-150 group-hover/field:border-border"
                          >
                            <div className="flex h-6 items-center gap-1.5">
                              <span className="min-w-0 flex-1 truncate text-xs">
                                {label}
                              </span>
                              <FieldFlagCheckbox
                                checked={required}
                                disabled={computed}
                                label="обяз."
                                title={
                                  computed
                                    ? "Вычисляемое поле заполняется автоматически"
                                    : "Обязательное поле"
                                }
                                onCheckedChange={(checked) =>
                                  setRequired(field.id, checked)
                                }
                              />
                              <FieldFlagCheckbox
                                checked={toComments}
                                disabled={!hasRecordsTab}
                                label="комм."
                                title={
                                  hasRecordsTab
                                    ? "Добавить содержимое в комментарии (вкладка «Записи»)"
                                    : "Нет вкладки «Записи» у этой сущности"
                                }
                                onCheckedChange={(checked) =>
                                  setComment(field.id, checked)
                                }
                              />
                              <FieldFlagCheckbox
                                checked={toRecord}
                                label="запись"
                                title="Записать значение в поле сущности"
                                onCheckedChange={(checked) =>
                                  setRecord(field.id, checked)
                                }
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="size-6 shrink-0"
                                aria-label="Убрать поле"
                                onClick={() => removeField(field.id)}
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            </div>
                            {field.type === "relationGroups" ? (
                              <div className="flex flex-wrap items-center gap-1 border-t border-border/40 pt-1.5 pb-0.5">
                                <span className="mr-0.5 text-[10px] text-muted-foreground">
                                  Спросить
                                </span>
                                {automationRelationGroupsAskModes(
                                  field.relationGroups?.levels.length ?? 2,
                                ).map((mode) => {
                                  const active =
                                    (access.fieldAskOptions[field.id]
                                      ?.relationGroupsMode ?? "full") === mode;
                                  return (
                                    <button
                                      key={mode}
                                      type="button"
                                      className={cn(
                                        "rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                                        active
                                          ? "bg-primary/10 text-primary"
                                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                      )}
                                      title={automationRelationGroupsAskModeLabel(
                                        mode,
                                      )}
                                      onClick={() =>
                                        setRelationGroupsMode(field.id, mode)
                                      }
                                    >
                                      {automationRelationGroupsAskModeLabel(
                                        mode,
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </div>
                </li>
              );
            })}
          </ul>
        </LayoutGroup>
      )}

      <div className="mt-3 border-t border-border/60 pt-2.5">
        <p className="text-xs font-medium text-muted-foreground">
          Поля связанных записей
        </p>
        {relatedSelected.length === 0 ? (
          <p className="mt-2 text-[11px] text-muted-foreground">Нет полей</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {relatedSelected.map((item) => {
              const row = resolveRelatedRow(item);
              const required = access.relatedRequiredIds.includes(item.id);
              const toComments = access.relatedCommentIds.includes(item.id);
              const toRecord = access.relatedRecordIds.includes(item.id);
              return (
                <li key={item.id} className="list-none">
                  <div className="flex h-8 items-center gap-1.5 rounded border border-border/50 bg-card px-2">
                    <span className="min-w-0 flex-1 truncate text-xs">
                      <span className="text-muted-foreground">
                        {row.relationLabel}
                      </span>
                      <span className="text-muted-foreground"> · </span>
                      {row.fieldLabel}
                    </span>
                    <FieldFlagCheckbox
                      checked={required}
                      label="обяз."
                      title="Обязательное поле связанной записи"
                      onCheckedChange={(checked) =>
                        setRelatedRequired(item.id, checked)
                      }
                    />
                    <FieldFlagCheckbox
                      checked={toComments}
                      disabled={!row.hasRecordsTab}
                      label="комм."
                      title={
                        row.hasRecordsTab
                          ? "Добавить содержимое в комментарии связанной записи"
                          : "Нет вкладки «Записи» у связанной сущности"
                      }
                      onCheckedChange={(checked) =>
                        setRelatedComment(item.id, checked)
                      }
                    />
                    <FieldFlagCheckbox
                      checked={toRecord}
                      label="запись"
                      title="Записать значение в поле связанной записи"
                      onCheckedChange={(checked) =>
                        setRelatedRecord(item.id, checked)
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="size-6 shrink-0"
                      aria-label="Убрать поле"
                      onClick={() => removeRelatedField(item.id)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function TemplateInspector({
  template,
  entity,
  entities,
  options,
  triggerFieldId,
  notificationRules,
  onSave,
  onDelete,
  commitLabel = "Сохранить",
  commitSuccessMessage = "Шаг сохранён",
}: {
  template: AutomationTaskTemplate;
  entity: Entity;
  entities: Entity[];
  options: Array<{ id: string; name: string }>;
  /** Process trigger list field — stage moves on outcome complete. */
  triggerFieldId: string;
  notificationRules: AutomationNotificationRule[];
  onSave: (template: AutomationTaskTemplate) => void | Promise<void>;
  onDelete: () => void;
  /** Label for the inspector commit button (applies to parent draft). */
  commitLabel?: string;
  commitSuccessMessage?: string;
}) {
  const [draft, setDraft] = useState(template);
  const [tab, setTab] = useState("general");
  /** Which result button is open in «Результаты» — independent of other tabs. */
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string | null>(
    template.outcomes[0]?.id ?? null,
  );
  const [saving, setSaving] = useState(false);
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  /** Update local draft and push into the builder so toolbar Save enables. */
  function commitDraft(
    updater: (prev: AutomationTaskTemplate) => AutomationTaskTemplate,
  ) {
    setDraft((prev) => {
      const next = updater(prev);
      queueMicrotask(() => {
        void Promise.resolve(onSaveRef.current(next)).catch(
          (error: unknown) => {
            console.error("[automation] apply template failed", error);
          },
        );
      });
      return next;
    });
  }

  function patch(partial: Partial<AutomationTaskTemplate>) {
    commitDraft((prev) => ({ ...prev, ...partial }));
  }

  /** Merge into the latest outcome — never replace from a stale render snapshot. */
  function patchOutcome(index: number, patch: Partial<AutomationOutcome>) {
    commitDraft((prev) => {
      const current = prev.outcomes[index];
      if (!current) return prev;
      const outcomes = [...prev.outcomes];
      outcomes[index] = { ...current, ...patch };
      return { ...prev, outcomes };
    });
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(draft);
      toast.success(commitSuccessMessage);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Не удалось сохранить шаг";
      console.error("[automation] save template failed", error);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function addNotificationRule() {
    const rule: AutomationNotificationRule = {
      id: createAutomationNotificationRuleId(),
      templateId: draft.id,
      event: "assigned",
      recipients: defaultAssigneeResolver(),
      conditions: emptyAutomationConditions(),
      messageTemplate: "",
    };
    await saveNotificationRule(rule);
  }

  function addOutcome() {
    const id = createAutomationOutcomeId();
    patch({
      outcomes: [
        ...draft.outcomes,
        {
          id,
          label: "Результат",
          color: null,
          actions: [],
          fieldAccess: emptyAutomationOutcomeFieldAccess(),
          conditions: emptyAutomationConditions(),
        },
      ],
    });
    setSelectedOutcomeId(id);
    setTab("outcomes");
  }

  const activeOutcomeId = draft.outcomes.some(
    (item) => item.id === selectedOutcomeId,
  )
    ? selectedOutcomeId
    : (draft.outcomes[0]?.id ?? null);
  const selectedOutcomeIndex = draft.outcomes.findIndex(
    (item) => item.id === activeOutcomeId,
  );
  const selectedOutcome =
    selectedOutcomeIndex >= 0 ? draft.outcomes[selectedOutcomeIndex]! : null;
  const selectedStageId = selectedOutcome
    ? (getOutcomeStageOptionId(selectedOutcome.actions, triggerFieldId) ?? "")
    : "";
  const selectedActionsWithoutStage = selectedOutcome
    ? withoutOutcomeStageAction(selectedOutcome.actions, triggerFieldId)
    : [];
  const hasRecordsTab = entity.tabs.some(isEntityRecordsTab);

  const stageName =
    options.find((item) => item.id === draft.triggerOptionId)?.name ??
    "Без стадии";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold leading-snug">
            {draft.name.trim() ? (
              <TemplateRichText value={draft.name} fields={entity.fields} />
            ) : (
              "Новая задача"
            )}
          </h3>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {stageName} · {KIND_LABELS[draft.kind]}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-destructive"
          aria-label="Удалить шаг"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <TabsList
          variant="line"
          className="h-9 w-full shrink-0 justify-start gap-4 overflow-x-auto"
        >
          <TabsTrigger value="general" className="px-0">
            Задание
          </TabsTrigger>
          <TabsTrigger value="assignee" className="px-0">
            Кто
          </TabsTrigger>
          <TabsTrigger value="conditions" className="px-0">
            Условия
          </TabsTrigger>
          <TabsTrigger value="outcomes" className="px-0">
            {draft.kind === "autofill" ? "Переходы" : "Кнопки"}
          </TabsTrigger>
          <TabsTrigger value="more" className="px-0">
            Ещё
          </TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 overflow-auto pt-4">
          <TabsContent value="general" className="mt-0 flex flex-col gap-3.5">
            <InspectorSection title="Текст">
              <TemplateFieldInput
                id="template-name"
                title="Название"
                value={draft.name}
                placeholder="Согласовать смету"
                fields={entity.fields}
                onChange={(name) => patch({ name })}
              />
              <TemplateFieldInput
                id="template-name-list"
                title="Имя в списке"
                value={draft.nameTemplate}
                placeholder="Как в названии"
                fields={entity.fields}
                onChange={(nameTemplate) => patch({ nameTemplate })}
              />
              <TemplateFieldInput
                id="template-description"
                title="Описание"
                value={draft.description}
                placeholder="Что нужно сделать"
                fields={entity.fields}
                multiline
                onChange={(description) => patch({ description })}
              />
            </InspectorSection>

            <InspectorSection title="Запуск">
              <Field title="Стадия">
                <Select
                  value={draft.triggerOptionId}
                  onValueChange={(next) => {
                    if (next != null) patch({ triggerOptionId: String(next) });
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {options.find((item) => item.id === draft.triggerOptionId)
                        ?.name || "Выберите стадию"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="grid grid-cols-2 items-end gap-3">
                <Field title="Порядок">
                  <Input
                    type="number"
                    value={String(draft.stepOrder)}
                    onChange={(event) =>
                      patch({ stepOrder: Number(event.target.value) || 0 })
                    }
                  />
                </Field>
                <Field title="Тип шага">
                  <Select
                    value={draft.kind}
                    onValueChange={(next) => {
                      if (
                        next === "decision" ||
                        next === "single" ||
                        next === "autofill"
                      ) {
                        patch({
                          kind: next,
                          outcomes: outcomesForKind(next, draft.outcomes),
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>{KIND_LABELS[draft.kind]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="decision">
                        {KIND_LABELS.decision}
                      </SelectItem>
                      <SelectItem value="single">
                        {KIND_LABELS.single}
                      </SelectItem>
                      <SelectItem value="autofill">
                        Переход / автозаполнение
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field title="Момент запуска">
                <Select
                  value={draft.launchPhase ?? "onEnter"}
                  onValueChange={(next) => {
                    if (next !== "onEnter" && next !== "beforeEnter") return;
                    const launchPhase = next as AutomationLaunchPhase;
                    if (
                      launchPhase === "beforeEnter" &&
                      triggerFieldId &&
                      draft.triggerOptionId
                    ) {
                      // Seed «Перейти на стадию» so prep completion lands on this
                      // stage (default «Готово» buttons otherwise leave the record).
                      patch({
                        launchPhase,
                        outcomes: draft.outcomes.map((outcome) => {
                          if (
                            getOutcomeStageOptionId(
                              outcome.actions,
                              triggerFieldId,
                            )
                          ) {
                            return outcome;
                          }
                          return {
                            ...outcome,
                            actions: withOutcomeStageAction(
                              outcome.actions,
                              triggerFieldId,
                              draft.triggerOptionId,
                            ),
                          };
                        }),
                      });
                      return;
                    }
                    patch({ launchPhase });
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(draft.launchPhase ?? "onEnter") === "beforeEnter"
                        ? "До старта"
                        : "После старта"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beforeEnter">
                      До старта — до смены стадии
                    </SelectItem>
                    <SelectItem value="onEnter">
                      После старта — на этой стадии
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <InspectorSwitchRow>
                <SettingSwitch
                  id="template-enabled"
                  title="Включено"
                  description="Выключенное задание не создаётся и пропускается в цепочке"
                  checked={draft.enabled !== false}
                  onCheckedChange={(enabled) => patch({ enabled })}
                />
              </InspectorSwitchRow>

              <InspectorSwitchRow>
                <SettingSwitch
                  id="template-blocking"
                  title="Блокирует переход"
                  checked={draft.isBlocking}
                  onCheckedChange={(isBlocking) => patch({ isBlocking })}
                  disabled={draft.enabled === false}
                />
              </InspectorSwitchRow>
            </InspectorSection>
          </TabsContent>

          <TabsContent value="assignee" className="mt-0 flex flex-col gap-3.5">
            <InspectorSection title="Исполнитель">
              <AssigneeEditor
                mode="assignee"
                value={draft.assignee}
                fields={entity.fields}
                entities={entities}
                entityId={entity.id}
                onChange={(assignee) => patch({ assignee })}
                renderConditions={({ value, onChange }) => (
                  <ConditionGroupBuilder
                    entity={entity}
                    value={value}
                    onChange={onChange}
                  />
                )}
              />
            </InspectorSection>

            <InspectorSection title="Наблюдатели">
              <AssigneeEditor
                mode="watcher"
                value={draft.watchers}
                fields={entity.fields}
                entities={entities}
                entityId={entity.id}
                onChange={(watchers) => patch({ watchers })}
                renderConditions={({ value, onChange }) => (
                  <ConditionGroupBuilder
                    entity={entity}
                    value={value}
                    onChange={onChange}
                  />
                )}
              />
            </InspectorSection>
          </TabsContent>

          <TabsContent
            value="conditions"
            className="mt-0 flex flex-col gap-3.5"
          >
            <InspectorSection title="Условия запуска">
              <ConditionGroupBuilder
                entity={entity}
                value={draft.launchConditions}
                onChange={(launchConditions) => patch({ launchConditions })}
              />
            </InspectorSection>
          </TabsContent>

          <TabsContent value="outcomes" className="mt-0 flex flex-col gap-3.5">
            {draft.kind === "autofill" ? (
              <OutcomeRouteBranchesEditor
                outcomes={draft.outcomes}
                entity={entity}
                entities={entities}
                triggerFieldId={triggerFieldId}
                stages={options}
                onChange={(outcomes) => patch({ outcomes })}
              />
            ) : (
              <InspectorSection
                title="Кнопки результата"
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={addOutcome}
                  >
                    <Plus className="size-3.5" />
                    Кнопка
                  </Button>
                }
              >
                {draft.outcomes.length === 0 ? (
                  <InspectorEmpty>Нет кнопок</InspectorEmpty>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {draft.outcomes.map((outcome, index) => (
                        <OutcomeButtonChip
                          key={outcome.id}
                          outcome={outcome}
                          selected={outcome.id === activeOutcomeId}
                          onSelect={() => setSelectedOutcomeId(outcome.id)}
                          onChange={(patch) => patchOutcome(index, patch)}
                        />
                      ))}
                    </div>

                    {selectedOutcome && selectedOutcomeIndex >= 0 ? (
                      <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/10 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            Настройки кнопки
                          </p>
                          {draft.outcomes.length > 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-destructive"
                              onClick={() => {
                                const next = draft.outcomes.filter(
                                  (item) => item.id !== selectedOutcome.id,
                                );
                                patch({ outcomes: next });
                                setSelectedOutcomeId(next[0]?.id ?? null);
                              }}
                            >
                              Удалить
                            </Button>
                          ) : null}
                        </div>

                        <OutcomeStageSelect
                          compact
                          value={selectedStageId}
                          stages={options}
                          triggerFieldId={triggerFieldId}
                          onChange={(nextStageId) =>
                            patchOutcome(selectedOutcomeIndex, {
                              actions: withOutcomeStageAction(
                                selectedActionsWithoutStage,
                                triggerFieldId,
                                nextStageId,
                              ),
                            })
                          }
                        />

                        <OutcomeAskFieldsEditor
                          fields={entity.fields}
                          entities={entities}
                          value={selectedOutcome.fieldAccess}
                          hasRecordsTab={hasRecordsTab}
                          onChange={(fieldAccess) =>
                            patchOutcome(selectedOutcomeIndex, {
                              fieldAccess,
                            })
                          }
                        />

                        <OutcomeAutofillEditor
                          actions={selectedActionsWithoutStage}
                          fieldAccess={selectedOutcome.fieldAccess}
                          sourceEntity={entity}
                          entities={entities}
                          hasRecordsTab={hasRecordsTab}
                          excludeFieldIds={
                            triggerFieldId ? [triggerFieldId] : undefined
                          }
                          hint="Значения подставятся сами; «комм.» — ещё и в «Записи»"
                          onChange={(actions) =>
                            patchOutcome(selectedOutcomeIndex, {
                              actions: withOutcomeStageAction(
                                actions,
                                triggerFieldId,
                                selectedStageId,
                              ),
                            })
                          }
                          onFieldAccessChange={(fieldAccess) =>
                            patchOutcome(selectedOutcomeIndex, {
                              fieldAccess,
                            })
                          }
                        />

                        <Field title="Другие действия">
                          <ActionPipelineEditor
                            actions={selectedActionsWithoutStage}
                            entities={entities}
                            sourceEntity={entity}
                            omitKinds={["setField"]}
                            addKind="createRecord"
                            onChange={(actions) =>
                              patchOutcome(selectedOutcomeIndex, {
                                actions: withOutcomeStageAction(
                                  actions,
                                  triggerFieldId,
                                  selectedStageId,
                                ),
                              })
                            }
                          />
                        </Field>
                      </div>
                    ) : null}
                  </>
                )}
              </InspectorSection>
            )}
          </TabsContent>

          <TabsContent value="more" className="mt-0 flex flex-col gap-3.5">
            <InspectorSection title="Срок">
              <Field title="Часы">
                <Input
                  type="number"
                  value={
                    draft.sla?.hours != null ? String(draft.sla.hours) : ""
                  }
                  placeholder="Без срока"
                  onChange={(event) => {
                    const hours = Number(event.target.value);
                    patch({
                      sla:
                        Number.isFinite(hours) && hours > 0
                          ? { hours, calendar: "247" }
                          : null,
                    });
                  }}
                />
              </Field>
              <InspectorSwitchRow>
                <SettingSwitch
                  id="template-require-time"
                  title="Обязательный учёт времени"
                  description="Без сессии нельзя завершить"
                  checked={automationRequiresTimeTracking(draft.materials)}
                  onCheckedChange={(required) =>
                    patch({
                      materials: setAutomationRequireTimeTracking(
                        draft.materials,
                        required,
                      ),
                    })
                  }
                />
              </InspectorSwitchRow>
            </InspectorSection>

            <InspectorSection title="Файлы">
              <TemplateUploadTargetSettings
                entity={entity}
                materials={draft.materials}
                onMaterialsChange={(materials) => patch({ materials })}
              />
            </InspectorSection>

            <InspectorSection
              title="Уведомления"
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => void addNotificationRule()}
                >
                  <Plus className="size-3.5" />
                  Добавить
                </Button>
              }
            >
              {notificationRules.length === 0 ? (
                <InspectorEmpty>Нет уведомлений</InspectorEmpty>
              ) : (
                notificationRules.map((rule) => (
                  <AutomationNotificationRuleEditor
                    key={rule.id}
                    rule={rule}
                    entity={entity}
                    onSave={(next) => void saveNotificationRule(next)}
                    onDelete={() => void removeNotificationRule(rule.id)}
                  />
                ))
              )}
            </InspectorSection>
          </TabsContent>
        </div>
      </Tabs>

      <div className="relative z-10 shrink-0 border-t border-border bg-background pt-3">
        <Button
          type="button"
          className="w-full"
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {saving ? "Сохранение…" : commitLabel}
        </Button>
      </div>
    </div>
  );
}
