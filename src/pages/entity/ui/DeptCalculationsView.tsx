/**
 * Hardcoded «Расчёты отделов» table — same UX as ipk-new ReviewDepartmentsSection:
 * stage group → department summary row → expand «Работы отдела» + nested lines.
 */

import { useMemo, useState, type ReactNode } from "react";
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
  formatEntityDecimalTotal,
  formatRecordFieldValue,
  getRecordFieldNumber,
  removeEntityRecord,
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
  resolveDeptCalcTypeLabel,
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
import { EntityRecordDialog } from "./EntityRecordDialog";
import { RecordDeleteConfirmDialog } from "./RecordDeleteConfirmDialog";

const headClass =
  "h-9 border-b border-border bg-foreground/[0.045] px-3 text-[11px] font-semibold tracking-wide whitespace-nowrap text-foreground/65 uppercase";

type DeptCalculationsViewProps = {
  entity: Entity;
  records: EntityRecord[];
  onEditRecord?: (record: EntityRecord) => void;
};

function StatusPill({ label }: { label: string }) {
  if (!label || label === "—") {
    return <span className="text-muted-foreground/60">—</span>;
  }
  return (
    <span className="inline-flex max-w-full truncate rounded-md border border-border/80 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground/80">
      {label}
    </span>
  );
}

function StaticField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-background px-3 py-2">
      <div className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className="truncate text-sm font-medium text-foreground"
        title={value}
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
              <TableHead className={cn(headClass, "w-[18%]")}>Отдел</TableHead>
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
              <TableHead className={cn(headClass, "w-[12%] text-right")}>
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
                    const managerName =
                      resolveDeptCalculationManagerName(
                        entity,
                        record,
                        entities,
                      ) ?? "Не назначен";
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
                    const description = hostFields.description
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
                    const lines = getDeptNestedLines(record, nested);
                    const preview = breakdown.lineTitles.slice(0, 2).join(", ");

                    return (
                      <DepartmentBlock
                        key={record.id}
                        expanded={expanded}
                        showFixed={showFixed}
                        columnCount={columnCount}
                        deptLabel={deptLabel}
                        preview={preview}
                        fallbackHint={description || comment}
                        managerName={managerName}
                        lineCount={breakdown.lineCount || lines.length}
                        hours={breakdown.hours}
                        deadline={deadlineValue}
                        fixedExpenses={breakdown.fixedExpenses}
                        total={breakdown.total}
                        statusLabel={statusLabel}
                        onToggle={() =>
                          setExpandedId(expanded ? null : record.id)
                        }
                        onAddLine={() => {
                          setExpandedId(record.id);
                          setLineDialog({ mode: "create", hostId: record.id });
                        }}
                        onEdit={() => onEditRecord?.(record)}
                        onDelete={() =>
                          setDeleteTarget({ kind: "host", record })
                        }
                        deadlineField={Boolean(hostFields.deadline)}
                        deadlineInput={deadlineInput}
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
                        onSaveContext={() => void saveDepartmentContext(record)}
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
      <TableRow className="border-border/70 bg-primary/5 hover:bg-primary/5">
        <TableCell colSpan={columnCount} className="px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex rounded-md border border-border/80 bg-background px-2 py-0.5 text-xs font-semibold text-foreground">
                {groupLabel}
              </span>
              <span className="text-xs text-muted-foreground">
                {departmentCount} отд.
              </span>
            </div>
            <div className="flex gap-4 text-xs tabular-nums">
              <span>{formatDeptHours(stageHours)} ч</span>
              <span className="text-muted-foreground">Итог отделов:</span>
              <span className="font-medium">{formatDeptMoney(stageTotal)}</span>
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
  preview,
  fallbackHint,
  managerName,
  lineCount,
  hours,
  deadline,
  fixedExpenses,
  total,
  statusLabel,
  onToggle,
  onAddLine,
  onEdit,
  onDelete,
  deadlineField,
  deadlineInput,
  onDeadlineChange,
  descriptionField,
  descriptionInput,
  onDescriptionChange,
  onSaveContext,
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
  preview: string;
  fallbackHint: string;
  managerName: string;
  lineCount: number;
  hours: number;
  deadline: number | null;
  fixedExpenses: number;
  total: number;
  statusLabel: string;
  onToggle: () => void;
  onAddLine: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  deadlineField: boolean;
  deadlineInput: string;
  onDeadlineChange: (value: string) => void;
  descriptionField: boolean;
  descriptionInput: string;
  onDescriptionChange: (value: string) => void;
  onSaveContext: () => void;
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
  return (
    <>
      <TableRow className="border-border/70 align-top">
        <TableCell className="px-3 py-3">
          <button
            type="button"
            className="flex w-full items-start gap-2.5 text-left"
            onClick={onToggle}
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 space-y-0.5">
              <div className="font-medium break-words text-foreground">
                {deptLabel}
              </div>
              {preview ? (
                <div className="text-xs break-words text-muted-foreground">
                  {preview}
                  {lineCount > 2 ? "…" : ""}
                </div>
              ) : fallbackHint ? (
                <div className="line-clamp-2 text-xs break-words text-muted-foreground">
                  {fallbackHint}
                </div>
              ) : null}
            </div>
          </button>
        </TableCell>
        <TableCell className="px-3 py-3 text-sm">{managerName}</TableCell>
        <TableCell className="px-3 py-3 text-right tabular-nums">
          {lineCount}
        </TableCell>
        <TableCell className="px-3 py-3 text-right tabular-nums">
          {formatDeptHours(hours)}
        </TableCell>
        <TableCell className="px-3 py-3 text-right tabular-nums">
          {formatDeptDeadlineDays(deadline)}
        </TableCell>
        {showFixed ? (
          <TableCell className="px-3 py-3 text-right tabular-nums">
            {formatDeptMoney(fixedExpenses)}
          </TableCell>
        ) : null}
        <TableCell className="px-3 py-3 text-right font-medium tabular-nums">
          {formatDeptMoney(total)}
        </TableCell>
        <TableCell className="px-3 py-3">
          <StatusPill label={statusLabel} />
        </TableCell>
        <TableCell className="px-3 py-3">
          <div className="flex items-center justify-end gap-1">
            {nested ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={onAddLine}
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
                className="size-8"
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
              className="size-8 hover:text-destructive"
              aria-label="Удалить"
              onClick={onDelete}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {expanded ? (
        <TableRow className="border-border/70 bg-muted/10 hover:bg-muted/10">
          <TableCell colSpan={columnCount} className="p-0">
            <div className="space-y-4 px-4 py-4">
              <div className="flex flex-col gap-1 rounded-md border border-border bg-background p-3">
                <div className="text-sm font-medium">Работы отдела</div>
                <div className="text-xs text-muted-foreground">
                  Подзадачи ведутся отдельно от общего контекста расчёта отдела.
                </div>
              </div>

              {showContextPanel ? (
                <div className="space-y-4 rounded-md border border-border bg-background p-4">
                  {deadlineField ? (
                    <div className="grid gap-3 md:grid-cols-[minmax(0,20rem)_auto] md:items-end">
                      <div className="grid gap-1.5">
                        <Label htmlFor={`deadline-${deptLabel}`}>
                          Срок выполнения работы, раб. дни
                        </Label>
                        <Input
                          id={`deadline-${deptLabel}`}
                          type="number"
                          min="0.5"
                          step="0.5"
                          value={deadlineInput}
                          onChange={(event) =>
                            onDeadlineChange(event.target.value)
                          }
                        />
                      </div>
                      {!descriptionField ? (
                        <Button type="button" onClick={onSaveContext}>
                          Сохранить срок
                        </Button>
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
                    <div className="flex justify-end">
                      <Button type="button" onClick={onSaveContext}>
                        {deadlineField
                          ? "Сохранить срок и описание"
                          : "Сохранить описание"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div
                className={cn(
                  "grid gap-3",
                  showFixed ? "md:grid-cols-5" : "md:grid-cols-4",
                )}
              >
                <StaticField label="Руководитель отдела" value={managerName} />
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
                            const calcLabel = resolveDeptCalcTypeLabel(
                              entities,
                              lineFields.calcType,
                              line.values[lineFields.calcType?.id ?? ""],
                            );
                            const hoursOrSum = resolveDeptLineHoursOrSum(
                              valueContext,
                              nested.entity,
                              line,
                              entities,
                              lineFields,
                            );
                            const cost = lineFields.cost
                              ? getRecordFieldNumber(
                                  valueContext,
                                  nested.entity,
                                  line,
                                  lineFields.cost,
                                )
                              : hoursOrSum.isHours
                                ? null
                                : hoursOrSum.value;
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
                                <td className="px-3 py-2.5 font-medium">
                                  {title}
                                </td>
                                <td className="px-3 py-2.5">
                                  <StatusPill label={calcLabel} />
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">
                                  {hoursOrSum.value == null
                                    ? "—"
                                    : formatEntityDecimalTotal(
                                        hoursOrSum.value,
                                      )}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">
                                  {cost == null ? "—" : formatDeptMoney(cost)}
                                </td>
                                <td className="px-3 py-2.5 text-muted-foreground">
                                  {lineComment || "—"}
                                </td>
                                <td className="px-3 py-2.5 text-right">
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
