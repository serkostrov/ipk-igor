import { useState, type ReactNode } from "react";
import { Filter, LayoutTemplate, Table2, TableProperties } from "lucide-react";
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
  createSummaryBoardLayout,
  getEntityFieldOptions,
  getEntityFieldValueKind,
  getEntitySummableFields,
  hasEntityPageLayout,
  normalizeEntityPageLayout,
  setEntityPageLayout,
  useEntityConfig,
  type Entity,
  type EntityPageAggregatePanel,
  type EntityPageFiltersPanel,
  type EntityPageLayout,
  type EntityPageRecordsPanel,
} from "@/entities/entity";
import { SettingLabel, SettingSwitch } from "@/shared/ui/setting-controls";
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
  return { aggregate, filters, records };
}

function fromBoardDraft(draft: BoardDraft): EntityPageLayout {
  return createSummaryBoardLayout({
    panels: [draft.aggregate, draft.filters, draft.records],
    rows: [],
  });
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

function LayoutPreview() {
  return (
    <div
      className="grid gap-1.5 rounded-lg border border-border/60 bg-muted/20 p-2.5"
      aria-hidden
    >
      <div className="grid grid-cols-[2fr_1fr] gap-1.5">
        <div className="flex h-10 items-center justify-center rounded-md border border-dashed border-border/80 bg-background/80 text-[10px] font-medium text-muted-foreground">
          Сводная таблица
        </div>
        <div className="flex h-10 items-center justify-center rounded-md border border-dashed border-border/80 bg-background/80 text-[10px] font-medium text-muted-foreground">
          Фильтры
        </div>
      </div>
      <div className="flex h-12 items-center justify-center rounded-md border border-dashed border-border/80 bg-background/80 text-[10px] font-medium text-muted-foreground">
        Список записей
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
            <LayoutPreview />

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
