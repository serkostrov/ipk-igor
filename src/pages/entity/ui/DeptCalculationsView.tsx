/**
 * Hardcoded «Расчёты отделов» table — same UX as ipk-new ReviewDepartmentsSection:
 * stage group → department summary row → expand «Работы отдела» + nested lines.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { cn } from "@/shared/lib/cn";
import {
  addEntityRecord,
  applyTkpGipDepartmentUsers,
  collectDeptCalculationSiblingRecords,
  formatEntityDecimalTotal,
  formatRecordFieldValue,
  getEntityConfig,
  getEntityListOption,
  getRecordFieldNumber,
  removeEntityRecord,
  resolveEntityListFieldOptions,
  resolveEntityListFieldPresentation,
  resolveTkpHostStageOptionId,
  serializeEntityRelationIds,
  updateEntityRecord,
  useEntityConfig,
  useEntityValueContext,
  waitForEntityRecordInsert,
  type Entity,
  type EntityRecord,
  type EntityTableNestedTarget,
  type EntityValueContext,
} from "@/entities/entity";
import {
  calculateDeptCalculationsBreakdown,
  formatDeptDeadlineDays,
  formatDeptHours,
  formatDeptMoney,
  getDeptNestedLines,
  resolveDeptCalcTypeLabelForRecord,
  resolveDeptLineCost,
  resolveDeptLineHoursOrSum,
  resolveDeptLineTitle,
} from "@/features/hardcode/dept-calculations/model/aggregation";
import {
  resolveDeptCalculationsHostFields,
  resolveDeptCalculationsSubtaskFields,
  type DeptCalculationsSubtaskFields,
} from "@/features/hardcode/dept-calculations/model/fields";
import { resolveDeptCalculationsNestedTarget } from "@/features/hardcode/dept-calculations/model/resolve-nested";
import {
  buildDeptCalculationStageGroups,
  resolveDeptCalculationDepartmentLabel,
  resolveDeptCalculationManagerName,
} from "@/features/hardcode/dept-calculations/model/stage-groups";
import { syncDeptCalculationCatalogManagers } from "@/features/hardcode/tkp-gip/fan-out-related-persist";
import { maybeEnsureDeptCalculationGipForParent } from "@/features/hardcode/tkp-gip/gip-filling-phase";
import { EntityRecordDialog } from "./EntityRecordDialog";
import { RecordDeleteConfirmDialog } from "./RecordDeleteConfirmDialog";

const headClass =
  "h-9 border-b border-border/80 bg-muted/40 px-3 text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase";

const cellClass = "px-3 py-2.5 align-middle";

type DeptCalculationsViewProps = {
  entity: Entity;
  records: EntityRecord[];
  onEditRecord?: (record: EntityRecord) => void;
  /** Parent «Разбор ТКП» — hardcode: ГИП manager from lead. */
  leadParent?: { entity: Entity; record: EntityRecord } | null;
  /**
   * When set, only these records are editable (e.g. GIP row in the GIP
   * review task). Others show «Только просмотр».
   * Omit / null = every row is editable.
   */
  editableRecordIds?: ReadonlySet<string> | null;
};

function StatusPill({
  label,
  color,
}: {
  label: string;
  /** Optional list-option color (dot + tinted chip). */
  color?: string | null;
}) {
  const text = label.trim();
  if (!text || text === "—") {
    return <span className="text-muted-foreground/50">—</span>;
  }
  const tint = color?.trim() || null;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 truncate rounded-md border px-2 py-0.5 text-[11px] font-medium",
        tint
          ? "border-black/5 text-foreground"
          : "border-border/70 bg-muted/35 text-foreground/80",
      )}
      style={tint ? { backgroundColor: `${tint}28` } : undefined}
      title={text}
    >
      {tint ? (
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: tint }}
          aria-hidden
        />
      ) : null}
      <span className="truncate">{text}</span>
    </span>
  );
}

function ManagerCell({ name }: { name: string | null }) {
  if (!name) {
    return (
      <span className="text-[13px] text-muted-foreground/55">Не назначен</span>
    );
  }
  return (
    <span className="truncate text-[13px] text-foreground" title={name}>
      {name}
    </span>
  );
}

function MetricCell({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "tabular-nums",
        muted ? "text-muted-foreground/55" : "text-foreground",
      )}
    >
      {children}
    </span>
  );
}

function StaticField({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/80 bg-background px-3 py-2.5">
      <div className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={cn(
          "text-sm font-medium text-foreground",
          multiline
            ? "whitespace-pre-wrap break-words leading-snug"
            : "truncate",
        )}
        title={multiline ? undefined : value}
      >
        {value}
      </div>
    </div>
  );
}

export function DeptCalculationsView({
  entity,
  records,
  onEditRecord,
  leadParent = null,
  editableRecordIds = null,
}: DeptCalculationsViewProps) {
  const { entities } = useEntityConfig();
  const valueContext = useEntityValueContext();
  const hostFields = useMemo(
    () => resolveDeptCalculationsHostFields(entity),
    [entity],
  );
  const nested = useMemo(
    () => resolveDeptCalculationsNestedTarget(entity, entities),
    [entity, entities],
  );
  const lineFields = useMemo(
    () => (nested ? resolveDeptCalculationsSubtaskFields(nested.entity) : null),
    [nested],
  );
  const stageGroups = useMemo(
    () => buildDeptCalculationStageGroups(entity, records, entities),
    [entity, records, entities],
  );

  const recordIdsKey = records
    .map((record) => record.id)
    .sort()
    .join(",");
  const leadParentEntityId = leadParent?.entity.id ?? "";
  const leadParentRecordId = leadParent?.record.id ?? "";
  const leadParentStageKey = leadParent
    ? resolveTkpHostStageOptionId(leadParent.entity, leadParent.record.values)
    : "";
  const healedParentKeysRef = useRef(new Set<string>());
  const healInFlightRef = useRef(new Set<string>());

  // Soft-fill empty managers — skips rows that already have a value.
  useEffect(() => {
    syncDeptCalculationCatalogManagers({ entity, records, entities });
  }, [entity, entities, recordIdsKey, records]);

  // Deferred ГИП rows + lead GIP users. Key includes host stage so entering
  // «На заполнении ГИПа» re-runs after a no-op on the departments stage.
  useEffect(() => {
    if (!leadParentEntityId || !leadParentRecordId) return;
    const healKey = `${entity.id}:${leadParentEntityId}:${leadParentRecordId}:${leadParentStageKey}`;
    if (
      healedParentKeysRef.current.has(healKey) ||
      healInFlightRef.current.has(healKey)
    ) {
      return;
    }
    healInFlightRef.current.add(healKey);

    const parentEntity =
      entities.find((item) => item.id === leadParentEntityId) ?? null;
    const parentRecord =
      parentEntity?.records.find((item) => item.id === leadParentRecordId) ??
      null;
    if (!parentEntity || !parentRecord) {
      healInFlightRef.current.delete(healKey);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const ensured = await maybeEnsureDeptCalculationGipForParent({
          parentEntity,
          parentRecord,
          entities,
        });
        if (cancelled) return;

        // Only fill GIP users after we actually ensured (GIP-filling stage).
        if (!ensured) {
          healedParentKeysRef.current.add(healKey);
          return;
        }

        const liveEntity =
          getEntityConfig().entities.find((item) => item.id === entity.id) ??
          entity;
        const seedIds =
          recordIdsKey.length > 0
            ? recordIdsKey.split(",")
            : liveEntity.records.map((record) => record.id);
        if (seedIds.length === 0) {
          healedParentKeysRef.current.add(healKey);
          return;
        }

        const siblings = collectDeptCalculationSiblingRecords(
          liveEntity,
          seedIds,
          { entity: parentEntity, recordId: parentRecord.id },
        );
        for (const record of siblings) {
          const next = applyTkpGipDepartmentUsers({
            childEntity: entity,
            childValues: { ...record.values },
            entities,
            parentEntity,
            parentRecord,
            changedFieldId: null,
          });
          if (!next.applied || next.overriddenFieldIds.length === 0) continue;
          const patch: Record<string, string> = {};
          for (const fieldId of next.overriddenFieldIds) {
            const value = next.values[fieldId] ?? "";
            if ((record.values[fieldId] ?? "") === value) continue;
            patch[fieldId] = value;
          }
          if (Object.keys(patch).length === 0) continue;
          updateEntityRecord(entity.id, record.id, {
            ...record.values,
            ...patch,
          });
        }
        if (!cancelled) healedParentKeysRef.current.add(healKey);
      } finally {
        healInFlightRef.current.delete(healKey);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    entity,
    entities,
    leadParentEntityId,
    leadParentRecordId,
    leadParentStageKey,
    recordIdsKey,
  ]);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deadlineDrafts, setDeadlineDrafts] = useState<Record<string, string>>(
    {},
  );
  const [descriptionDrafts, setDescriptionDrafts] = useState<
    Record<string, string>
  >({});
  const [lineDialog, setLineDialog] = useState<
    | { mode: "create"; hostId: string }
    | { mode: "edit"; hostId: string; record: EntityRecord }
    | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: "host"; record: EntityRecord }
    | { kind: "line"; record: EntityRecord }
    | null
  >(null);

  const showFixed =
    Boolean(hostFields.fixedExpenses) || Boolean(lineFields?.sum);
  const columnCount = showFixed ? 9 : 8;

  async function saveDepartmentContext(record: EntityRecord) {
    if (!hostFields.deadline && !hostFields.description) return;
    const next = { ...record.values };
    if (hostFields.deadline) {
      next[hostFields.deadline.id] =
        deadlineDrafts[record.id] ??
        record.values[hostFields.deadline.id] ??
        "";
    }
    if (hostFields.description) {
      next[hostFields.description.id] =
        descriptionDrafts[record.id] ??
        record.values[hostFields.description.id] ??
        "";
    }
    await updateEntityRecord(entity.id, record.id, next);
    // Drop drafts so the form reflects the saved record.
    setDeadlineDrafts((prev) => {
      if (!(record.id in prev)) return prev;
      const copy = { ...prev };
      delete copy[record.id];
      return copy;
    });
    setDescriptionDrafts((prev) => {
      if (!(record.id in prev)) return prev;
      const copy = { ...prev };
      delete copy[record.id];
      return copy;
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="min-w-0 flex-1 overflow-auto rounded-xl border border-border bg-card shadow-xs">
        <Table
          className="table-fixed text-[13px]"
          containerClassName="overflow-visible"
        >
          <TableHeader>
            <TableRow className="border-0 hover:bg-transparent">
              <TableHead className={cn(headClass, "w-[22%]")}>Отдел</TableHead>
              <TableHead className={cn(headClass, "w-[16%]")}>
                Руководитель
              </TableHead>
              <TableHead className={cn(headClass, "w-[8%] text-right")}>
                Подзадачи
              </TableHead>
              <TableHead className={cn(headClass, "w-[8%] text-right")}>
                Часы
              </TableHead>
              <TableHead className={cn(headClass, "w-[10%] text-right")}>
                Срок, раб. дни
              </TableHead>
              {showFixed ? (
                <TableHead className={cn(headClass, "w-[10%] text-right")}>
                  Фикс. расходы
                </TableHead>
              ) : null}
              <TableHead className={cn(headClass, "w-[10%] text-right")}>
                Итог
              </TableHead>
              <TableHead className={cn(headClass, "w-[10%]")}>Статус</TableHead>
              <TableHead className={cn(headClass, "w-[14%] text-right")}>
                Действия
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="[&_tr:last-child]:border-0">
            {stageGroups.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columnCount}
                  className="px-3 py-10 text-center text-sm text-muted-foreground"
                >
                  Пока нет расчётов отделов
                </TableCell>
              </TableRow>
            ) : null}

            {stageGroups.map((group) => {
              let stageHours = 0;
              let stageTotal = 0;
              for (const record of group.records) {
                const breakdown = calculateDeptCalculationsBreakdown(
                  valueContext,
                  entity,
                  record,
                  entities,
                  nested,
                  hostFields,
                  lineFields,
                );
                stageHours += breakdown.hours;
                stageTotal += breakdown.total;
              }

              return (
                <StageBlock
                  key={group.id || "empty"}
                  groupLabel={group.label}
                  departmentCount={group.records.length}
                  stageHours={stageHours}
                  stageTotal={stageTotal}
                  columnCount={columnCount}
                >
                  {group.records.map((record) => {
                    const expanded = expandedId === record.id;
                    const canEdit =
                      editableRecordIds == null ||
                      editableRecordIds.has(record.id);
                    const breakdown = calculateDeptCalculationsBreakdown(
                      valueContext,
                      entity,
                      record,
                      entities,
                      nested,
                      hostFields,
                      lineFields,
                    );
                    const deptLabel = resolveDeptCalculationDepartmentLabel(
                      valueContext,
                      entity,
                      record,
                      entities,
                    );
                    const managerName = resolveDeptCalculationManagerName(
                      valueContext,
                      entity,
                      record,
                      entities,
                      leadParent,
                    );
                    const deadlineValue = hostFields.deadline
                      ? getRecordFieldNumber(
                          valueContext,
                          entity,
                          record,
                          hostFields.deadline,
                        )
                      : null;
                    const statusLabel = hostFields.status
                      ? formatRecordFieldValue(
                          valueContext,
                          entity,
                          record,
                          hostFields.status,
                        )
                      : "—";
                    const comment = hostFields.comment
                      ? (record.values[hostFields.comment.id] ?? "").trim()
                      : "";
                    const savedDeadline = hostFields.deadline
                      ? (record.values[hostFields.deadline.id] ?? "").trim()
                      : "";
                    const savedDescription = hostFields.description
                      ? (record.values[hostFields.description.id] ?? "").trim()
                      : "";
                    const deadlineInput =
                      deadlineDrafts[record.id] ??
                      (hostFields.deadline
                        ? (record.values[hostFields.deadline.id] ?? "")
                        : "");
                    const descriptionInput =
                      descriptionDrafts[record.id] ??
                      (hostFields.description
                        ? (record.values[hostFields.description.id] ?? "")
                        : "");
                    // Form open/close uses persisted values — drafts must not
                    // collapse the editor on first keystroke (looks like autosave).
                    const contextSaved =
                      (!hostFields.deadline || savedDeadline.length > 0) &&
                      (!hostFields.description || savedDescription.length > 0);
                    const lines = getDeptNestedLines(record, nested);

                    return (
                      <DepartmentBlock
                        key={record.id}
                        expanded={expanded}
                        showFixed={showFixed}
                        columnCount={columnCount}
                        deptLabel={deptLabel}
                        managerName={managerName}
                        lineCount={breakdown.lineCount || lines.length}
                        hours={breakdown.hours}
                        deadline={deadlineValue}
                        fixedExpenses={breakdown.fixedExpenses}
                        total={breakdown.total}
                        statusLabel={statusLabel}
                        canEdit={canEdit}
                        onToggle={() =>
                          setExpandedId(expanded ? null : record.id)
                        }
                        onAddLine={() => {
                          setExpandedId(record.id);
                          const deadlineOk =
                            !hostFields.deadline ||
                            deadlineInput.trim().length > 0;
                          if (!deadlineOk) return;
                          setLineDialog({ mode: "create", hostId: record.id });
                        }}
                        onEdit={
                          canEdit && onEditRecord
                            ? () => onEditRecord(record)
                            : undefined
                        }
                        onDelete={() =>
                          setDeleteTarget({ kind: "host", record })
                        }
                        deadlineField={Boolean(hostFields.deadline)}
                        deadlineInput={deadlineInput}
                        contextSaved={contextSaved}
                        onDeadlineChange={(value) =>
                          setDeadlineDrafts((prev) => ({
                            ...prev,
                            [record.id]: value,
                          }))
                        }
                        descriptionField={Boolean(hostFields.description)}
                        descriptionInput={descriptionInput}
                        onDescriptionChange={(value) =>
                          setDescriptionDrafts((prev) => ({
                            ...prev,
                            [record.id]: value,
                          }))
                        }
                        onSaveContext={() => saveDepartmentContext(record)}
                        onCancelContext={() => {
                          setDeadlineDrafts((prev) => {
                            if (!(record.id in prev)) return prev;
                            const next = { ...prev };
                            delete next[record.id];
                            return next;
                          });
                          setDescriptionDrafts((prev) => {
                            if (!(record.id in prev)) return prev;
                            const next = { ...prev };
                            delete next[record.id];
                            return next;
                          });
                        }}
                        comment={comment}
                        laborCost={breakdown.laborCost}
                        lines={lines}
                        nested={nested}
                        lineFields={lineFields}
                        valueContext={valueContext}
                        entities={entities}
                        onEditLine={(line) =>
                          setLineDialog({
                            mode: "edit",
                            hostId: record.id,
                            record: line,
                          })
                        }
                        onDeleteLine={(line) =>
                          setDeleteTarget({ kind: "line", record: line })
                        }
                      />
                    );
                  })}
                </StageBlock>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {nested && lineDialog ? (
        <EntityRecordDialog
          open
          onOpenChange={(open) => {
            if (!open) setLineDialog(null);
          }}
          entity={nested.entity}
          record={lineDialog.mode === "edit" ? lineDialog.record : null}
          entities={entities}
          presetValues={{
            [nested.parentLinkFieldId]: serializeEntityRelationIds([
              lineDialog.hostId,
            ]),
          }}
          hiddenFieldIds={new Set([nested.parentLinkFieldId])}
          titleOverride={
            lineDialog.mode === "create"
              ? `Новая ${nested.entity.name.trim().toLowerCase() || "подзадача"}`
              : undefined
          }
          submitLabel="Сохранить"
          onSubmit={async (values) => {
            const nextValues = {
              ...values,
              [nested.parentLinkFieldId]: serializeEntityRelationIds([
                lineDialog.hostId,
              ]),
            };
            if (lineDialog.mode === "create") {
              const created = addEntityRecord(nested.entity.id, nextValues);
              await waitForEntityRecordInsert(created.id);
            } else {
              await updateEntityRecord(
                nested.entity.id,
                lineDialog.record.id,
                nextValues,
              );
            }
            setLineDialog(null);
          }}
        />
      ) : null}

      <RecordDeleteConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        entityId={
          deleteTarget?.kind === "host"
            ? entity.id
            : (nested?.entity.id ?? null)
        }
        recordIds={deleteTarget ? [deleteTarget.record.id] : []}
        title="Удалить запись?"
        description={
          deleteTarget?.kind === "host"
            ? "Отдел и связанные подзадачи будут удалены из списка. Это действие нельзя отменить."
            : "Подзадача будет удалена. Это действие нельзя отменить."
        }
        onConfirm={() => {
          if (!deleteTarget) return;
          if (deleteTarget.kind === "host") {
            removeEntityRecord(entity.id, deleteTarget.record.id);
            if (expandedId === deleteTarget.record.id) setExpandedId(null);
          } else if (nested) {
            removeEntityRecord(nested.entity.id, deleteTarget.record.id);
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

function StageBlock({
  groupLabel,
  departmentCount,
  stageHours,
  stageTotal,
  columnCount,
  children,
}: {
  groupLabel: string;
  departmentCount: number;
  stageHours: number;
  stageTotal: number;
  columnCount: number;
  children: ReactNode;
}) {
  return (
    <>
      <TableRow className="border-border/60 bg-muted/35 hover:bg-muted/35">
        <TableCell colSpan={columnCount} className="px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="text-[13px] font-semibold tracking-wide text-foreground">
                {groupLabel}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {departmentCount} отд.
              </span>
            </div>
            <div className="flex items-center gap-3 text-[12px] tabular-nums text-muted-foreground">
              <span>{formatDeptHours(stageHours)} ч</span>
              <span className="text-border">·</span>
              <span>
                Итог{" "}
                <span className="font-medium text-foreground">
                  {formatDeptMoney(stageTotal)}
                </span>
              </span>
            </div>
          </div>
        </TableCell>
      </TableRow>
      {children}
    </>
  );
}

function DepartmentBlock({
  expanded,
  showFixed,
  columnCount,
  deptLabel,
  managerName,
  lineCount,
  hours,
  deadline,
  fixedExpenses,
  total,
  statusLabel,
  canEdit = true,
  onToggle,
  onAddLine,
  onEdit,
  onDelete,
  deadlineField,
  deadlineInput,
  contextSaved,
  onDeadlineChange,
  descriptionField,
  descriptionInput,
  onDescriptionChange,
  onSaveContext,
  onCancelContext,
  comment,
  laborCost,
  lines,
  nested,
  lineFields,
  valueContext,
  entities,
  onEditLine,
  onDeleteLine,
}: {
  expanded: boolean;
  showFixed: boolean;
  columnCount: number;
  deptLabel: string;
  managerName: string | null;
  lineCount: number;
  hours: number;
  deadline: number | null;
  fixedExpenses: number;
  total: number;
  statusLabel: string;
  canEdit?: boolean;
  onToggle: () => void;
  onAddLine: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  deadlineField: boolean;
  deadlineInput: string;
  /** Persisted deadline+description — not draft keystrokes. */
  contextSaved: boolean;
  onDeadlineChange: (value: string) => void;
  descriptionField: boolean;
  descriptionInput: string;
  onDescriptionChange: (value: string) => void;
  onSaveContext: () => void | Promise<void>;
  onCancelContext: () => void;
  comment: string;
  laborCost: number;
  lines: EntityRecord[];
  nested: EntityTableNestedTarget | null;
  lineFields: DeptCalculationsSubtaskFields | null;
  valueContext: EntityValueContext;
  entities: Entity[];
  onEditLine: (line: EntityRecord) => void;
  onDeleteLine: (line: EntityRecord) => void;
}) {
  const showContextPanel = deadlineField || descriptionField;
  const deadlineFilled = !deadlineField || deadlineInput.trim().length > 0;
  /** Подзадачи нельзя добавлять без срока выполнения работы. */
  const canAddLines = deadlineFilled;
  const [editingContext, setEditingContext] = useState(false);
  // Stay in the editor until Save/Cancel — drafts must not auto-collapse.
  const showContextForm = canEdit && (!contextSaved || editingContext);

  async function handleSaveContext() {
    await onSaveContext();
    setEditingContext(false);
  }

  function handleCancelContext() {
    onCancelContext();
    setEditingContext(false);
  }

  function handleAddLineClick() {
    if (!canAddLines) {
      setEditingContext(true);
      onAddLine();
      return;
    }
    onAddLine();
  }

  return (
    <>
      <TableRow
        className={cn(
          "border-border/60 transition-colors",
          expanded ? "bg-muted/15 hover:bg-muted/15" : "hover:bg-muted/25",
        )}
      >
        <TableCell className={cellClass}>
          <button
            type="button"
            className="flex w-full min-w-0 items-center gap-2 text-left"
            onClick={onToggle}
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate text-[13px] font-medium text-foreground">
              {deptLabel}
            </span>
          </button>
        </TableCell>
        <TableCell className={cellClass}>
          <ManagerCell name={managerName} />
        </TableCell>
        <TableCell className={cn(cellClass, "text-right")}>
          <MetricCell muted={lineCount === 0}>{lineCount}</MetricCell>
        </TableCell>
        <TableCell className={cn(cellClass, "text-right")}>
          <MetricCell muted={hours === 0}>{formatDeptHours(hours)}</MetricCell>
        </TableCell>
        <TableCell className={cn(cellClass, "text-right")}>
          <MetricCell muted={deadline == null || deadline === 0}>
            {formatDeptDeadlineDays(deadline)}
          </MetricCell>
        </TableCell>
        {showFixed ? (
          <TableCell className={cn(cellClass, "text-right")}>
            <MetricCell muted={fixedExpenses === 0}>
              {formatDeptMoney(fixedExpenses)}
            </MetricCell>
          </TableCell>
        ) : null}
        <TableCell className={cn(cellClass, "text-right font-medium")}>
          <MetricCell muted={total === 0}>{formatDeptMoney(total)}</MetricCell>
        </TableCell>
        <TableCell className={cellClass}>
          <StatusPill label={statusLabel} />
        </TableCell>
        <TableCell className={cellClass}>
          {canEdit ? (
            <div className="flex items-center justify-end gap-0.5">
              {nested ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-7 gap-1 px-2 text-[11px]",
                    !canAddLines && "opacity-60",
                  )}
                  title={
                    canAddLines
                      ? "Добавить подзадачу"
                      : "Сначала укажите срок выполнения работы"
                  }
                  aria-disabled={!canAddLines}
                  onClick={handleAddLineClick}
                >
                  <Plus className="size-3.5" data-icon="inline-start" />
                  Строка
                </Button>
              ) : null}
              {onEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-7"
                  aria-label="Редактировать"
                  onClick={onEdit}
                >
                  <Pencil className="size-3.5" />
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-7 hover:text-destructive"
                aria-label="Удалить"
                onClick={onDelete}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex justify-end">
              <span className="text-[11px] text-muted-foreground/70">
                Только просмотр
              </span>
            </div>
          )}
        </TableCell>
      </TableRow>

      {expanded ? (
        <TableRow className="border-border/60 bg-muted/10 hover:bg-muted/10">
          <TableCell colSpan={columnCount} className="p-0">
            <div className="space-y-3 border-t border-border/50 px-4 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    Работы отдела
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Подзадачи ведутся отдельно от общего контекста расчёта
                    отдела.
                  </div>
                </div>
              </div>

              {showContextPanel ? (
                <div className="space-y-4 rounded-md border border-border bg-background p-4">
                  {showContextForm ? (
                    <>
                      {deadlineField ? (
                        <div className="grid gap-3 md:grid-cols-[minmax(0,20rem)_auto] md:items-end">
                          <div className="grid gap-1.5">
                            <Label htmlFor={`deadline-${deptLabel}`}>
                              Срок выполнения работы, раб. дни
                              <span className="text-destructive" aria-hidden>
                                {" "}
                                *
                              </span>
                            </Label>
                            <Input
                              id={`deadline-${deptLabel}`}
                              type="number"
                              min="0.5"
                              step="0.5"
                              value={deadlineInput}
                              required
                              aria-required
                              aria-invalid={!deadlineFilled ? true : undefined}
                              className={cn(
                                !deadlineFilled &&
                                  "border-destructive/60 focus-visible:ring-destructive/30",
                              )}
                              onChange={(event) =>
                                onDeadlineChange(event.target.value)
                              }
                            />
                            {!deadlineFilled ? (
                              <p className="text-[11px] text-destructive/90">
                                Укажите срок, чтобы добавлять подзадачи
                              </p>
                            ) : null}
                          </div>
                          {!descriptionField ? (
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                disabled={!deadlineFilled}
                                onClick={() => void handleSaveContext()}
                              >
                                Сохранить срок
                              </Button>
                              {contextSaved && editingContext ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={handleCancelContext}
                                >
                                  Отмена
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {descriptionField ? (
                        <div className="grid gap-1.5">
                          <Label htmlFor={`description-${deptLabel}`}>
                            Описание работ
                          </Label>
                          <Textarea
                            id={`description-${deptLabel}`}
                            rows={3}
                            value={descriptionInput}
                            placeholder="Общее описание объёма работ для отдела"
                            onChange={(event) =>
                              onDescriptionChange(event.target.value)
                            }
                          />
                        </div>
                      ) : null}

                      {descriptionField ? (
                        <div className="flex items-center justify-start gap-2">
                          <Button
                            type="button"
                            disabled={deadlineField && !deadlineFilled}
                            onClick={() => void handleSaveContext()}
                          >
                            {deadlineField
                              ? "Сохранить срок и описание"
                              : "Сохранить описание"}
                          </Button>
                          {contextSaved && editingContext ? (
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={handleCancelContext}
                            >
                              Отмена
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "grid min-w-0 flex-1 gap-3",
                          deadlineField && descriptionField
                            ? "md:grid-cols-2"
                            : "md:grid-cols-1",
                        )}
                      >
                        {deadlineField ? (
                          <StaticField
                            label="Срок выполнения работы, раб. дни"
                            value={
                              deadlineInput.trim() ? deadlineInput : "Не указан"
                            }
                          />
                        ) : null}
                        {descriptionField ? (
                          <StaticField
                            label="Описание работ"
                            value={
                              descriptionInput.trim() ? descriptionInput : "—"
                            }
                            multiline
                          />
                        ) : null}
                      </div>
                      {canEdit ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label="Редактировать срок и описание"
                          onClick={() => setEditingContext(true)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}

              <div
                className={cn(
                  "grid gap-3",
                  showFixed ? "md:grid-cols-5" : "md:grid-cols-4",
                )}
              >
                <StaticField
                  label="Руководитель отдела"
                  value={managerName ?? "Не назначен"}
                />
                <StaticField
                  label="Общие часы"
                  value={`${formatDeptHours(hours)} ч`}
                />
                {showFixed ? (
                  <StaticField
                    label="Фиксированные расходы"
                    value={formatDeptMoney(fixedExpenses)}
                  />
                ) : null}
                <StaticField
                  label="Стоимость трудозатрат"
                  value={formatDeptMoney(laborCost)}
                />
                <StaticField
                  label="Итог отдела"
                  value={formatDeptMoney(total)}
                />
              </div>

              {comment ? (
                <div className="rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <div className="mb-1 text-[11px] tracking-wide text-muted-foreground uppercase">
                    Комментарий отдела
                  </div>
                  <div className="whitespace-pre-wrap break-words">
                    {comment}
                  </div>
                </div>
              ) : null}

              {nested && lineFields ? (
                <div className="space-y-3 rounded-md border border-border bg-background p-4">
                  {lines.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-6 text-center text-xs text-muted-foreground">
                      Подзадачи пока не добавлены.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[920px] table-fixed text-sm">
                        <colgroup>
                          <col className="w-[32%]" />
                          <col className="w-[14%]" />
                          <col className="w-[12%]" />
                          <col className="w-[14%]" />
                          <col className="w-[20%]" />
                          <col className="w-[8%]" />
                        </colgroup>
                        <thead className="border-b border-border bg-muted/30 text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                          <tr>
                            <th className="px-3 py-2">Подзадача / шаблон</th>
                            <th className="px-3 py-2">Тип расчёта</th>
                            <th className="px-3 py-2 text-right">
                              Часы / сумма
                            </th>
                            <th className="px-3 py-2 text-right">Стоимость</th>
                            <th className="px-3 py-2">Комментарий</th>
                            <th className="px-3 py-2 text-right">Действия</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((line) => {
                            const title = resolveDeptLineTitle(
                              valueContext,
                              nested.entity,
                              line,
                              lineFields,
                            );
                            const hoursOrSum = resolveDeptLineHoursOrSum(
                              valueContext,
                              nested.entity,
                              line,
                              entities,
                              lineFields,
                            );
                            const calcLabel = resolveDeptCalcTypeLabelForRecord(
                              valueContext,
                              nested.entity,
                              line,
                              entities,
                              lineFields,
                            );
                            const calcTypeField = lineFields.calcType;
                            const calcTypePresentation = calcTypeField
                              ? resolveEntityListFieldPresentation(
                                  calcTypeField,
                                  entities,
                                )
                              : null;
                            const calcTypeOption =
                              calcTypeField?.type === "list"
                                ? getEntityListOption(
                                    resolveEntityListFieldOptions(
                                      calcTypeField,
                                      entities,
                                    ),
                                    line.values[calcTypeField.id],
                                  )
                                : null;
                            const calcTypeColor =
                              calcTypePresentation?.listUseColors &&
                              calcTypeOption?.color
                                ? calcTypeOption.color
                                : null;
                            const cost = resolveDeptLineCost(
                              valueContext,
                              nested.entity,
                              line,
                              lineFields,
                              hoursOrSum.isHours,
                            );
                            const lineComment = lineFields.comment
                              ? (
                                  line.values[lineFields.comment.id] ?? ""
                                ).trim()
                              : "";

                            return (
                              <tr
                                key={line.id}
                                className="border-b border-border/60 last:border-0"
                              >
                                <td className="max-w-0 px-3 py-2.5 align-top font-medium">
                                  <span
                                    className="block whitespace-normal break-words [overflow-wrap:anywhere]"
                                    title={title}
                                  >
                                    {title}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 align-top">
                                  <StatusPill
                                    label={calcLabel}
                                    color={calcTypeColor}
                                  />
                                </td>
                                <td className="px-3 py-2.5 align-top text-right tabular-nums">
                                  {hoursOrSum.value == null
                                    ? "—"
                                    : formatEntityDecimalTotal(
                                        hoursOrSum.value,
                                      )}
                                </td>
                                <td className="px-3 py-2.5 align-top text-right tabular-nums">
                                  {cost == null ? "—" : formatDeptMoney(cost)}
                                </td>
                                <td className="max-w-0 px-3 py-2.5 align-top text-muted-foreground">
                                  <span className="block whitespace-normal break-words [overflow-wrap:anywhere]">
                                    {lineComment || "—"}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 align-top text-right">
                                  {canEdit ? (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger
                                        render={
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            className="size-7"
                                            aria-label="Действия"
                                          />
                                        }
                                      >
                                        <MoreHorizontal className="size-3.5" />
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent
                                        align="end"
                                        searchable={false}
                                      >
                                        <DropdownMenuItem
                                          onClick={() => onEditLine(line)}
                                        >
                                          Редактировать
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          className="text-destructive"
                                          onClick={() => onDeleteLine(line)}
                                        >
                                          Удалить
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  ) : (
                                    <span className="text-muted-foreground/50">
                                      —
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
