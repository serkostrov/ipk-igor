import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
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
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { SettingSwitch } from "@/shared/ui/setting-controls";
import { cn } from "@/shared/lib/cn";
import {
  ENTITY_KANBAN_CARD_FIELD_LIMIT,
  getEntityFieldDisplayName,
  getEntityFieldTypeLabel,
  getEntityKanbanCardFieldCandidates,
  getEntityKanbanGroupFields,
  normalizeEntityKanbanCardFieldIds,
  resolveEntityKanbanCardFields,
  resolveEntityKanbanFieldId,
  setEntityKanbanCardFields,
  setEntityKanbanField,
  setEntityKanbanShowFilters,
  type Entity,
} from "@/entities/entity";

type EntityKanbanSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: Entity;
};

function KanbanSettingsForm({
  entity,
  onClose,
}: {
  entity: Entity;
  onClose: () => void;
}) {
  const groupFields = getEntityKanbanGroupFields(entity);
  const initialGroupFieldId = resolveEntityKanbanFieldId(
    entity.fields,
    entity.kanbanFieldId,
  );

  const [groupFieldId, setGroupFieldId] = useState(
    initialGroupFieldId ?? groupFields[0]?.id ?? "",
  );
  const [cardFieldIds, setCardFieldIds] = useState<string[] | null>(
    entity.kanbanCardFieldIds,
  );
  const [showFilters, setShowFilters] = useState(
    entity.kanbanShowFilters !== false,
  );
  const [cardFieldQuery, setCardFieldQuery] = useState("");

  const cardCandidates = getEntityKanbanCardFieldCandidates(entity);
  const cardFieldNeedle = cardFieldQuery.trim().toLocaleLowerCase("ru");
  const visibleCardCandidates = useMemo(() => {
    if (!cardFieldNeedle) return cardCandidates;
    return cardCandidates.filter((field) => {
      const name = getEntityFieldDisplayName(field).toLocaleLowerCase("ru");
      const type = getEntityFieldTypeLabel(field.type).toLocaleLowerCase("ru");
      return name.includes(cardFieldNeedle) || type.includes(cardFieldNeedle);
    });
  }, [cardCandidates, cardFieldNeedle]);
  const previewEntity: Entity = {
    ...entity,
    kanbanFieldId: groupFieldId || null,
    kanbanCardFieldIds: cardFieldIds,
  };
  const selectedCardFields = resolveEntityKanbanCardFields(
    previewEntity,
    groupFieldId || null,
  );
  const selectedCardIds = new Set(selectedCardFields.map((field) => field.id));
  const atCardLimit =
    selectedCardFields.length >= ENTITY_KANBAN_CARD_FIELD_LIMIT;
  const isCustomCardFields = cardFieldIds != null;

  function selectGroupField(fieldId: string) {
    setGroupFieldId(fieldId);
    setCardFieldIds((current) =>
      normalizeEntityKanbanCardFieldIds(entity.fields, fieldId, current),
    );
  }

  function toggleCardField(fieldId: string) {
    const selected = new Set(selectedCardFields.map((field) => field.id));
    if (selected.has(fieldId)) {
      selected.delete(fieldId);
    } else {
      if (atCardLimit) return;
      selected.add(fieldId);
    }
    setCardFieldIds(
      cardCandidates
        .filter((field) => selected.has(field.id))
        .map((field) => field.id),
    );
  }

  function handleSave() {
    if (!groupFieldId) return;
    setEntityKanbanField(entity.id, groupFieldId);
    setEntityKanbanCardFields(entity.id, cardFieldIds);
    setEntityKanbanShowFilters(entity.id, showFilters);
    onClose();
  }

  const selectedGroupField =
    groupFields.find((field) => field.id === groupFieldId) ?? null;

  if (groupFields.length === 0) {
    return (
      <>
        <DialogHeader className="gap-1">
          <DialogTitle>Настройки канбана</DialogTitle>
          <DialogDescription>
            Колонки доски и поля на карточке записи.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          Нужно поле списка или связи, чтобы настроить колонки канбана.
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Закрыть
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader className="gap-1">
        <DialogTitle>Настройки канбана</DialogTitle>
        <DialogDescription>
          Колонки доски, фильтры и поля на карточке записи.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-3.5">
        <SettingSwitch
          id="kanban-show-filters"
          title="Фильтры"
          description="Поиск и фильтры над колонками канбана"
          checked={showFilters}
          onCheckedChange={setShowFilters}
        />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="kanban-column-field">Поле колонок</Label>
          <Select
            value={groupFieldId || null}
            onValueChange={(value) => {
              if (value == null) return;
              selectGroupField(value);
            }}
          >
            <SelectTrigger id="kanban-column-field" className="w-full">
              <SelectValue placeholder="Выберите поле">
                {selectedGroupField
                  ? `${getEntityFieldDisplayName(selectedGroupField)} · ${
                      selectedGroupField.type === "list" ? "список" : "связь"
                    }`
                  : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {groupFields.map((field) => (
                <SelectItem key={field.id} value={field.id}>
                  {getEntityFieldDisplayName(field)}
                  <span className="text-muted-foreground">
                    {" · "}
                    {field.type === "list" ? "список" : "связь"}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <Label>Поля на карточке</Label>
            <span className="tabular-nums text-xs text-muted-foreground">
              {selectedCardFields.length}/{ENTITY_KANBAN_CARD_FIELD_LIMIT}
            </span>
          </div>

          {cardCandidates.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              Нет подходящих полей
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-border">
              <div className="relative border-b border-border">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={cardFieldQuery}
                  onChange={(event) => setCardFieldQuery(event.target.value)}
                  placeholder="Поиск полей"
                  aria-label="Поиск полей на карточке"
                  className="h-9 rounded-none border-0 bg-transparent pl-8 shadow-none focus-visible:ring-0"
                />
              </div>
              <div className="max-h-52 overflow-y-auto">
                {visibleCardCandidates.length === 0 ? (
                  <div className="px-3 py-6 text-center">
                    <p className="text-sm text-foreground">Ничего не найдено</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Попробуйте другой запрос
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col p-0.5">
                    {visibleCardCandidates.map((field) => {
                      const checked = selectedCardIds.has(field.id);
                      const disabled = !checked && atCardLimit;
                      return (
                        <button
                          key={field.id}
                          type="button"
                          disabled={disabled}
                          aria-pressed={checked}
                          onClick={() => toggleCardField(field.id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                            disabled
                              ? "cursor-not-allowed opacity-45"
                              : checked
                                ? "bg-primary/8 text-foreground"
                                : "text-foreground hover:bg-muted/50",
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-3.5 shrink-0 items-center justify-center rounded border transition-colors",
                              checked
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background",
                            )}
                            aria-hidden
                          >
                            {checked ? (
                              <Check className="size-2.5" strokeWidth={3} />
                            ) : null}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {getEntityFieldDisplayName(field)}
                            <span className="text-muted-foreground">
                              {" · "}
                              {getEntityFieldTypeLabel(field.type)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {isCustomCardFields ? (
            <button
              type="button"
              className="self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setCardFieldIds(null)}
            >
              Сбросить к умолчанию
            </button>
          ) : null}
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Отмена
        </Button>
        <Button type="button" disabled={!groupFieldId} onClick={handleSave}>
          Сохранить
        </Button>
      </DialogFooter>
    </>
  );
}

export function EntityKanbanSettingsDialog({
  open,
  onOpenChange,
  entity,
}: EntityKanbanSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        forceOverlay
        className="w-fit min-w-[min(100%,22rem)] max-w-[min(92vw,28rem)] gap-4 overflow-x-hidden sm:max-w-[min(92vw,28rem)]"
      >
        {open ? (
          <KanbanSettingsForm
            key={entity.id}
            entity={entity}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
