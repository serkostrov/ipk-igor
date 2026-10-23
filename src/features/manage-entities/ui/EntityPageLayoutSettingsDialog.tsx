import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Filter,
  LayoutTemplate,
  Scale,
  Table2,
  TableProperties,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/lib/cn";
import {
  lockDragSelection,
  restoreBodyCursor,
  setBodyCursor,
  unlockDragSelection,
} from "@/shared/lib/drag-selection";
import {
  createSummaryBoardLayout,
  getEntityFieldOptions,
  getEntityFieldValueKind,
  getEntitySummableFields,
  hasEntityPageLayout,
  normalizeEntityPageLayout,
  resizeEntityPageLayoutRowColumn,
  resolveEntityListFieldOptions,
  setEntityPageLayout,
  swapEntityPageLayoutPanels,
  useEntityConfig,
  type Entity,
  type EntityPageAggregateCashFlow,
  type EntityPageAggregatePanel,
  type EntityPageFiltersPanel,
  type EntityPageLayout,
  type EntityPagePanel,
  type EntityPageRecordsPanel,
  type EntityPageRow,
} from "@/entities/entity";
import {
  SettingLabel,
  SettingSelect,
  SettingSwitch,
} from "@/shared/ui/setting-controls";
import { Switch } from "@/shared/ui/switch";

type EntityPageLayoutSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: Entity;
};

type BoardDraft = {
  aggregate: EntityPageAggregatePanel;
  filters: EntityPageFiltersPanel;
  records: EntityPageRecordsPanel;
  rows: EntityPageRow[];
};

function toBoardDraft(layout: EntityPageLayout | null): BoardDraft | null {
  const normalized = normalizeEntityPageLayout(layout);
  if (!normalized) return null;
  const board = createSummaryBoardLayout(normalized);
  const aggregate = board.panels.find(
    (panel): panel is EntityPageAggregatePanel => panel.type === "aggregate",
  );
  const filters = board.panels.find(
    (panel): panel is EntityPageFiltersPanel => panel.type === "filters",
  );
  const records = board.panels.find(
    (panel): panel is EntityPageRecordsPanel => panel.type === "records",
  );
  if (!aggregate || !filters || !records) return null;
  return { aggregate, filters, records, rows: board.rows };
}

function sanitizeCashFlow(
  cashFlow: EntityPageAggregateCashFlow | undefined,
): EntityPageAggregateCashFlow | undefined {
  if (!cashFlow) return undefined;
  const dateFieldId = cashFlow.dateFieldId.trim();
  const directionFieldId = cashFlow.directionFieldId.trim();
  const amountFieldId = cashFlow.amountFieldId.trim();
  const incomeOptionIds = cashFlow.incomeOptionIds.filter(Boolean);
  const expenseOptionIds = cashFlow.expenseOptionIds.filter(Boolean);
  if (
    !dateFieldId ||
    !directionFieldId ||
    !amountFieldId ||
    incomeOptionIds.length === 0 ||
    expenseOptionIds.length === 0
  ) {
    return undefined;
  }
  return {
    dateFieldId,
    directionFieldId,
    amountFieldId,
    incomeOptionIds,
    expenseOptionIds,
  };
}

function fromBoardDraft(draft: BoardDraft): EntityPageLayout {
  const cashFlow = sanitizeCashFlow(draft.aggregate.cashFlow);
  const { cashFlow: previousCashFlow, ...aggregateRest } = draft.aggregate;
  void previousCashFlow;
  return createSummaryBoardLayout({
    panels: [
      {
        ...aggregateRest,
        ...(cashFlow ? { cashFlow } : {}),
      },
      draft.filters,
      draft.records,
    ],
    rows: draft.rows,
  });
}

const EMPTY_CASH_FLOW: EntityPageAggregateCashFlow = {
  dateFieldId: "",
  directionFieldId: "",
  amountFieldId: "",
  incomeOptionIds: [],
  expenseOptionIds: [],
};

function panelLabel(panel: EntityPagePanel) {
  if (panel.type === "aggregate")
    return panel.title?.trim() || "Сводная таблица";
  if (panel.type === "filters") return panel.title?.trim() || "Фильтры";
  return panel.title?.trim() || "Список записей";
}

function ModeCard({
  selected,
  icon,
  title,
  description,
  onSelect,
}: {
  selected: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-2 rounded-xl border px-3.5 py-3 text-left transition-colors",
        selected
          ? "border-primary/40 bg-primary/5 shadow-sm"
          : "border-border/70 bg-background/60 hover:border-border hover:bg-muted/30",
      )}
    >
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-lg",
          selected
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <span className="text-sm font-medium tracking-tight text-foreground">
        {title}
      </span>
      <span className="text-[11px] leading-snug text-muted-foreground">
        {description}
      </span>
    </button>
  );
}

/** Same red strip as field cards in entity settings. */
function LayoutDragHandle({
  active = false,
  onPointerDown,
}: {
  active?: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <span
      data-layout-drag-handle
      className={cn(
        "relative z-10 flex shrink-0 items-center justify-center self-stretch overflow-hidden touch-none select-none transition-[width,margin] duration-150",
        active
          ? "mr-0.5 w-3 cursor-grabbing"
          : "w-0 cursor-grab group-hover/layout-panel:mr-0.5 group-hover/layout-panel:w-3",
      )}
      aria-label="Перетащить блок"
      title="Перетащить блок"
      onPointerDown={onPointerDown}
    >
      <span
        aria-hidden
        className={cn(
          "my-1.5 h-[calc(100%-0.75rem)] min-h-7 w-1 shrink-0 rounded-full bg-primary",
          active ? "opacity-100" : "opacity-55",
        )}
      />
    </span>
  );
}

/** Same red corner arc as field cards in entity settings. */
function LayoutResizeArc({
  active = false,
  onPointerDown,
}: {
  active?: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label="Изменить размер"
      className="absolute right-0 bottom-0 z-10 flex size-5 cursor-default items-end justify-end p-0.5 select-none"
      onPointerDown={onPointerDown}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        className={cn(
          "size-4 text-primary transition-opacity duration-150",
          active
            ? "opacity-100"
            : "opacity-0 group-hover/layout-panel:opacity-55",
        )}
      >
        <path
          d="M18.5 8A10.5 10.5 0 0 1 8 18.5"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

function LayoutPreview({
  draft,
  onSwap,
  onResizeColumn,
}: {
  draft: BoardDraft;
  onSwap: (panelIdA: string, panelIdB: string) => void;
  onResizeColumn: (
    rowId: string,
    panelIndex: number,
    nextFraction: number,
  ) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [resizingKey, setResizingKey] = useState<string | null>(null);
  const panelById = new Map<string, EntityPagePanel>([
    [draft.aggregate.id, draft.aggregate],
    [draft.filters.id, draft.filters],
    [draft.records.id, draft.records],
  ]);

  function startDrag(panelId: string, event: ReactPointerEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();
    setDraggingId(panelId);
    lockDragSelection();
    const previousCursor = setBodyCursor("grabbing");

    function hitPanelId(clientX: number, clientY: number): string | null {
      const root = boardRef.current;
      if (!root) return null;
      const nodes = root.querySelectorAll<HTMLElement>(
        "[data-layout-panel-id]",
      );
      for (const node of nodes) {
        const id = node.dataset.layoutPanelId;
        if (!id || id === panelId) continue;
        const rect = node.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          return id;
        }
      }
      return null;
    }

    function onMove(moveEvent: PointerEvent) {
      moveEvent.preventDefault();
      setOverId(hitPanelId(moveEvent.clientX, moveEvent.clientY));
    }

    function onUp(upEvent: PointerEvent) {
      restoreBodyCursor(previousCursor);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const targetId = hitPanelId(upEvent.clientX, upEvent.clientY);
      setDraggingId(null);
      setOverId(null);
      unlockDragSelection();
      if (targetId && targetId !== panelId) onSwap(panelId, targetId);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function startResize(
    row: EntityPageRow,
    panelIndex: number,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (row.panelIds.length < 2) return;

    const rowEl = (event.currentTarget as HTMLElement).closest(
      "[data-layout-row-id]",
    );
    if (!(rowEl instanceof HTMLElement)) return;

    const columns =
      row.columns.length === row.panelIds.length
        ? [...row.columns]
        : row.panelIds.map(() => 1);
    const sum = columns.reduce((acc, value) => acc + value, 0);
    const unit = Math.max(rowEl.clientWidth / Math.max(sum, 1), 24);
    const startX = event.clientX;
    const startFraction = columns[panelIndex] ?? 1;
    const key = `${row.id}:${panelIndex}`;
    let lastFraction = startFraction;

    setResizingKey(key);
    lockDragSelection();
    const previousCursor = setBodyCursor("default");

    function onMove(moveEvent: PointerEvent) {
      moveEvent.preventDefault();
      setBodyCursor("default");
      const nextFraction =
        startFraction + Math.round((moveEvent.clientX - startX) / unit);
      if (nextFraction === lastFraction) return;
      lastFraction = nextFraction;
      onResizeColumn(row.id, panelIndex, nextFraction);
    }

    function onUp() {
      restoreBodyCursor(previousCursor);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setResizingKey(null);
      unlockDragSelection();
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  return (
    <div className="flex flex-col gap-2">
      <SettingLabel
        title="Расположение блоков"
        description="Красная полоска — переместить, угол — изменить ширину"
      />
      <div
        ref={boardRef}
        className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-muted/20 p-2.5"
      >
        {draft.rows.map((row) => (
          <div
            key={row.id}
            data-layout-row-id={row.id}
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: row.columns
                .map((fraction) => `${fraction}fr`)
                .join(" "),
            }}
          >
            {row.panelIds.map((panelId, panelIndex) => {
              const panel = panelById.get(panelId);
              if (!panel) return null;
              const isDragging = draggingId === panelId;
              const isOver =
                overId === panelId &&
                draggingId != null &&
                draggingId !== panelId;
              const canResize = row.panelIds.length > 1;
              const isResizing = resizingKey === `${row.id}:${panelIndex}`;
              return (
                <div
                  key={panelId}
                  data-layout-panel-id={panelId}
                  className={cn(
                    "group/layout-panel relative flex min-h-11 min-w-0 items-stretch outline-none select-none",
                    isDragging && "z-20 opacity-60",
                  )}
                >
                  <LayoutDragHandle
                    active={isDragging}
                    onPointerDown={(event) => startDrag(panelId, event)}
                  />
                  <div
                    className={cn(
                      "relative flex min-w-0 flex-1 items-center justify-center overflow-hidden rounded-md border border-dashed px-2 py-2 text-[10px] font-medium transition-[border-color,background-color,box-shadow]",
                      isDragging
                        ? "border-primary/50 bg-card text-foreground shadow-sm"
                        : isResizing
                          ? "border-primary/35 bg-background text-muted-foreground"
                          : isOver
                            ? "border-primary bg-primary/5 text-primary shadow-sm"
                            : "border-border/80 bg-background/80 text-muted-foreground hover:border-foreground/35 hover:bg-background",
                    )}
                  >
                    <span className="truncate">{panelLabel(panel)}</span>
                    {canResize ? (
                      <LayoutResizeArc
                        active={isResizing}
                        onPointerDown={(event) =>
                          startResize(row, panelIndex, event)
                        }
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function FieldChecklist({
  title,
  description,
  options,
  selectedIds,
  onChange,
  emptyHint,
}: {
  title: string;
  description?: string;
  options: { value: string; label: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptyHint: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SettingLabel title={title} description={description} />
      {options.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/70 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
          {emptyHint}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {options.map((option) => {
            const checked = selectedIds.includes(option.value);
            return (
              <label
                key={option.value}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40"
              >
                <span className="truncate text-sm">{option.label}</span>
                <Switch
                  checked={checked}
                  onCheckedChange={(next) => {
                    if (next) onChange([...selectedIds, option.value]);
                    else
                      onChange(selectedIds.filter((id) => id !== option.value));
                  }}
                />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BlockSection({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/10 p-3.5">
      <div className="flex gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium tracking-tight">{title}</h3>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3.5 border-t border-border/50 pt-3">
        {children}
      </div>
    </section>
  );
}

function PageLayoutSettingsForm({
  entity,
  onClose,
}: {
  entity: Entity;
  onClose: () => void;
}) {
  const { entities } = useEntityConfig();
  const [enabled, setEnabled] = useState(() => hasEntityPageLayout(entity));
  const [draft, setDraft] = useState<BoardDraft | null>(() =>
    toBoardDraft(entity.pageLayout),
  );

  const groupOptions = getEntityFieldOptions(
    entity.fields.filter((field) => {
      const kind = getEntityFieldValueKind(entity, field, entities);
      return kind === "list" || kind === "relation";
    }),
  );
  const valueOptions = getEntityFieldOptions(
    getEntitySummableFields(entity.fields),
  );
  const filterOptions = getEntityFieldOptions(
    entity.fields.filter((field) => field.showInFilters !== false),
  );
  const dateFieldOptions = getEntityFieldOptions(
    entity.fields.filter((field) => field.type === "datetime"),
  );
  const directionFieldOptions = getEntityFieldOptions(
    entity.fields.filter((field) => field.type === "list"),
  );
  const amountFieldOptions = getEntityFieldOptions(
    getEntitySummableFields(entity.fields),
  );
  const cashFlow = draft?.aggregate.cashFlow;
  const cashFlowEnabled = Boolean(cashFlow);
  const directionField = cashFlow
    ? (entity.fields.find((field) => field.id === cashFlow.directionFieldId) ??
      null)
    : null;
  const directionOptions = directionField
    ? resolveEntityListFieldOptions(directionField, entities).map((option) => ({
        value: option.id,
        label: option.name,
      }))
    : [];

  function enableBoard() {
    setEnabled(true);
    setDraft((current) => current ?? toBoardDraft(createSummaryBoardLayout()));
  }

  function disableBoard() {
    setEnabled(false);
  }

  function patchAggregate(patch: Partial<EntityPageAggregatePanel>) {
    setDraft((current) => {
      if (!current) return current;
      return { ...current, aggregate: { ...current.aggregate, ...patch } };
    });
  }

  function patchCashFlow(patch: Partial<EntityPageAggregateCashFlow> | null) {
    setDraft((current) => {
      if (!current) return current;
      if (patch === null) {
        const nextAggregate = { ...current.aggregate };
        delete nextAggregate.cashFlow;
        return { ...current, aggregate: nextAggregate };
      }
      const base = current.aggregate.cashFlow ?? EMPTY_CASH_FLOW;
      const next: EntityPageAggregateCashFlow = { ...base, ...patch };
      if (
        patch.directionFieldId != null &&
        patch.directionFieldId !== base.directionFieldId
      ) {
        next.incomeOptionIds = [];
        next.expenseOptionIds = [];
      }
      return {
        ...current,
        aggregate: { ...current.aggregate, cashFlow: next },
      };
    });
  }

  function patchFilters(patch: Partial<EntityPageFiltersPanel>) {
    setDraft((current) => {
      if (!current) return current;
      return { ...current, filters: { ...current.filters, ...patch } };
    });
  }

  function patchRecords(patch: Partial<EntityPageRecordsPanel>) {
    setDraft((current) => {
      if (!current) return current;
      return { ...current, records: { ...current.records, ...patch } };
    });
  }

  function swapPanels(panelIdA: string, panelIdB: string) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        rows: swapEntityPageLayoutPanels(current.rows, panelIdA, panelIdB),
      };
    });
  }

  function resizeColumn(
    rowId: string,
    panelIndex: number,
    nextFraction: number,
  ) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        rows: resizeEntityPageLayoutRowColumn(
          current.rows,
          rowId,
          panelIndex,
          nextFraction,
        ),
      };
    });
  }

  const canSave =
    !enabled || (draft != null && draft.aggregate.groupFieldIds.length > 0);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Макет страницы</DialogTitle>
        <DialogDescription>
          Как выглядит вкладка «Таблица»: обычный список или страница со сводкой
          и фильтрами.
        </DialogDescription>
      </DialogHeader>

      <div className="flex max-h-[min(70vh,38rem)] flex-col gap-5 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-2.5">
          <ModeCard
            selected={!enabled}
            icon={<Table2 className="size-4" aria-hidden />}
            title="Обычная таблица"
            description="Только список записей с поиском и фильтрами сверху."
            onSelect={disableBoard}
          />
          <ModeCard
            selected={enabled}
            icon={<LayoutTemplate className="size-4" aria-hidden />}
            title="Сводка и список"
            description="Сверху сводная таблица и фильтры, ниже — все записи."
            onSelect={enableBoard}
          />
        </div>

        {enabled && draft ? (
          <>
            <LayoutPreview
              draft={draft}
              onSwap={swapPanels}
              onResizeColumn={resizeColumn}
            />

            <BlockSection
              icon={<TableProperties className="size-3.5" aria-hidden />}
              title="Сводная таблица"
              description="Группы и суммы. Нажмите строку — список ниже отфильтруется."
            >
              <div className="flex flex-col gap-1.5">
                <SettingLabel
                  htmlFor="layout-aggregate-title"
                  title="Заголовок"
                  description="Необязательно"
                />
                <Input
                  id="layout-aggregate-title"
                  value={draft.aggregate.title ?? ""}
                  placeholder="Сводная таблица"
                  className="h-8"
                  onChange={(event) =>
                    patchAggregate({
                      title: event.target.value.trim() || null,
                    })
                  }
                />
              </div>

              <FieldChecklist
                title="Группировать по"
                description="Строки сводки — по значениям этих полей"
                options={groupOptions}
                selectedIds={draft.aggregate.groupFieldIds}
                onChange={(groupFieldIds) => patchAggregate({ groupFieldIds })}
                emptyHint="Добавьте поле списка или связи — по ним строится сводка."
              />

              <FieldChecklist
                title="Суммировать"
                description="Числовые поля в колонках сводки"
                options={valueOptions}
                selectedIds={draft.aggregate.valueFieldIds}
                onChange={(valueFieldIds) => patchAggregate({ valueFieldIds })}
                emptyHint="Нет числовых полей для сумм — сводка покажет только количество."
              />

              <SettingSwitch
                id="layout-show-count"
                title="Колонка «Количество»"
                description="Сколько записей в каждой группе"
                checked={draft.aggregate.showRecordCount}
                onCheckedChange={(showRecordCount) =>
                  patchAggregate({ showRecordCount })
                }
              />
            </BlockSection>

            <BlockSection
              icon={<Scale className="size-3.5" aria-hidden />}
              title="Остатки за период"
              description="Колонки: начало, приход, расход, конец. Период — из фильтра даты на странице."
            >
              <SettingSwitch
                id="layout-cash-flow"
                title="Показать остатки"
                description="Нужны поля даты, движения (приход/расход) и суммы"
                checked={cashFlowEnabled}
                onCheckedChange={(next) => {
                  if (next) patchCashFlow({ ...EMPTY_CASH_FLOW });
                  else patchCashFlow(null);
                }}
              />
              {cashFlowEnabled && cashFlow ? (
                <>
                  <SettingSelect
                    id="layout-cash-flow-date"
                    title="Дата операции"
                    description="Фильтр этого поля задаёт период на странице"
                    value={cashFlow.dateFieldId || null}
                    options={dateFieldOptions}
                    emptyLabel="Не выбрано"
                    noOptionsLabel="Добавьте поле даты на сущность"
                    onChange={(dateFieldId) =>
                      patchCashFlow({ dateFieldId: dateFieldId ?? "" })
                    }
                  />
                  <SettingSelect
                    id="layout-cash-flow-direction"
                    title="Движение"
                    description="Список: приход или расход"
                    value={cashFlow.directionFieldId || null}
                    options={directionFieldOptions}
                    emptyLabel="Не выбрано"
                    noOptionsLabel="Добавьте поле списка «Движение»"
                    onChange={(directionFieldId) =>
                      patchCashFlow({
                        directionFieldId: directionFieldId ?? "",
                      })
                    }
                  />
                  {directionOptions.length > 0 ? (
                    <>
                      <FieldChecklist
                        title="Варианты прихода"
                        description="Эти значения списка считаются приходом"
                        options={directionOptions}
                        selectedIds={cashFlow.incomeOptionIds}
                        onChange={(incomeOptionIds) =>
                          patchCashFlow({ incomeOptionIds })
                        }
                        emptyHint="Нет вариантов у поля движения"
                      />
                      <FieldChecklist
                        title="Варианты расхода"
                        description="Эти значения списка считаются расходом"
                        options={directionOptions}
                        selectedIds={cashFlow.expenseOptionIds}
                        onChange={(expenseOptionIds) =>
                          patchCashFlow({ expenseOptionIds })
                        }
                        emptyHint="Нет вариантов у поля движения"
                      />
                    </>
                  ) : cashFlow.directionFieldId ? (
                    <p className="rounded-md border border-dashed border-border/70 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
                      У выбранного списка нет вариантов
                    </p>
                  ) : null}
                  <SettingSelect
                    id="layout-cash-flow-amount"
                    title="Сумма"
                    description="Числовое поле операции (без знака)"
                    value={cashFlow.amountFieldId || null}
                    options={amountFieldOptions}
                    emptyLabel="Не выбрано"
                    noOptionsLabel="Добавьте числовое поле суммы"
                    onChange={(amountFieldId) =>
                      patchCashFlow({ amountFieldId: amountFieldId ?? "" })
                    }
                  />
                </>
              ) : null}
            </BlockSection>

            <BlockSection
              icon={<Filter className="size-3.5" aria-hidden />}
              title="Фильтры"
              description="Общие для сводки и списка записей."
            >
              <FieldChecklist
                title="Поля в блоке фильтров"
                description="Если ничего не выбрать — все поля, отмеченные «в фильтрах»"
                options={filterOptions}
                selectedIds={draft.filters.fieldIds ?? []}
                onChange={(ids) =>
                  patchFilters({ fieldIds: ids.length > 0 ? ids : null })
                }
                emptyHint="Включите «Показывать в фильтрах» у полей сущности."
              />
            </BlockSection>

            <BlockSection
              icon={<Table2 className="size-3.5" aria-hidden />}
              title="Список записей"
              description="Подробная таблица под сводкой — с пагинацией и действиями."
            >
              <div className="flex flex-col gap-1.5">
                <SettingLabel
                  htmlFor="layout-records-title"
                  title="Заголовок"
                  description="Необязательно — можно оставить пустым"
                />
                <Input
                  id="layout-records-title"
                  value={draft.records.title ?? ""}
                  placeholder="Без заголовка"
                  className="h-8"
                  onChange={(event) =>
                    patchRecords({
                      title: event.target.value.trim() || null,
                    })
                  }
                />
              </div>
            </BlockSection>

            {draft.aggregate.groupFieldIds.length === 0 ? (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] leading-snug text-amber-900 dark:text-amber-200">
                Выберите хотя бы одно поле группировки — иначе сводная таблица
                будет пустой.
              </p>
            ) : null}
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm leading-relaxed text-muted-foreground">
            На странице останется привычная таблица записей.
            <br />
            Выберите «Сводка и список», чтобы добавить блоки сверху.
          </p>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Отмена
        </Button>
        <Button
          type="button"
          disabled={!canSave}
          onClick={() => {
            if (!enabled || !draft) {
              setEntityPageLayout(entity.id, null);
            } else {
              setEntityPageLayout(entity.id, fromBoardDraft(draft));
            }
            onClose();
          }}
        >
          Сохранить
        </Button>
      </DialogFooter>
    </>
  );
}

export function EntityPageLayoutSettingsDialog({
  open,
  onOpenChange,
  entity,
}: EntityPageLayoutSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,46rem)] w-full max-w-[min(92vw,30rem)] flex-col gap-4 overflow-hidden sm:max-w-[min(92vw,30rem)]">
        {open ? (
          <PageLayoutSettingsForm
            key={entity.id}
            entity={entity}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
