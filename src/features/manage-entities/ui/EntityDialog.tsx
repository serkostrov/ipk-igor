import { useState } from "react";
import { ChartGantt, Check, Columns3, EyeOff, Pin, Table2 } from "lucide-react";
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
import { Textarea } from "@/shared/ui/textarea";
import { cn } from "@/shared/lib/cn";
import {
  ENTITY_VIEW_OPTIONS,
  getEntityBrowseViews,
  isEntityBrowseView,
  resolveEntityDefaultView,
  type Entity,
  type EntityBrowseView,
  type EntityView,
} from "@/entities/entity";

type EntityFormData = {
  name: string;
  namePlural: string;
  description: string;
  views: EntityView[];
  defaultView: EntityBrowseView | null;
};

type EntityDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity?: Entity | null;
  onSubmit: (data: EntityFormData) => void;
};

const viewIcons: Record<EntityView, typeof Table2> = {
  table: Table2,
  kanban: Columns3,
  timeline: ChartGantt,
  internal: EyeOff,
};

function EntityForm({
  entity,
  onCancel,
  onSubmit,
}: {
  entity?: Entity | null;
  onCancel: () => void;
  onSubmit: (data: EntityFormData) => void;
}) {
  const isEdit = Boolean(entity);
  const [name, setName] = useState(entity?.name ?? "");
  const [namePlural, setNamePlural] = useState(entity?.namePlural ?? "");
  const [description, setDescription] = useState(entity?.description ?? "");
  const [views, setViews] = useState<EntityView[]>(
    entity?.views?.length ? entity.views : ["table"],
  );
  const [defaultView, setDefaultView] = useState<EntityBrowseView | null>(
    () => {
      if (!entity) return "table";
      if (entity.views.includes("internal")) return null;
      return resolveEntityDefaultView(entity);
    },
  );
  const canSubmit =
    name.trim().length > 0 && namePlural.trim().length > 0 && views.length > 0;
  const activeDefault = resolveEntityDefaultView({ views, defaultView });

  function toggleView(view: EntityView) {
    if (view === "internal") {
      setDefaultView(null);
      setViews((current) =>
        current.includes("internal") && current.length === 1
          ? current
          : ["internal"],
      );
      return;
    }

    const browse = views.filter((item) => item !== "internal");
    let next: EntityView[];
    if (browse.includes(view)) {
      if (browse.length === 1) return;
      next = browse.filter((item) => item !== view);
    } else {
      next = [...browse, view];
    }

    setViews(next);
    const nextBrowse = getEntityBrowseViews(next);
    setDefaultView((currentDefault) => {
      if (currentDefault && nextBrowse.includes(currentDefault)) {
        return currentDefault;
      }
      return nextBrowse[0] ?? null;
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isEdit ? "Редактировать сущность" : "Новая сущность"}
        </DialogTitle>
        <DialogDescription>
          Название, описание и способы отображения записей.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="entity-name">Название</Label>
          <Input
            id="entity-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Например, Проект"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="entity-name-plural">Название во множ. числе</Label>
          <Input
            id="entity-name-plural"
            value={namePlural}
            onChange={(event) => setNamePlural(event.target.value)}
            placeholder="Например, Проекты"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="entity-description">Описание</Label>
          <Textarea
            id="entity-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Кратко, для чего нужна эта сущность"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Отображение</Label>

          <div className="flex flex-wrap gap-2">
            {ENTITY_VIEW_OPTIONS.map((option) => {
              const Icon = viewIcons[option.value];
              const selected = views.includes(option.value);
              const isBrowse = isEntityBrowseView(option.value);
              const isDefault =
                selected && isBrowse && activeDefault === option.value;

              return (
                <div
                  key={option.value}
                  className={cn(
                    "relative inline-flex w-fit max-w-full select-none items-center gap-2 rounded-md border px-2.5 py-2 transition-colors",
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border bg-background hover:border-foreground/20 hover:bg-muted/40",
                  )}
                >
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleView(option.value)}
                    className="absolute inset-0 z-0 rounded-md"
                    aria-label={option.label}
                  />

                  <span
                    className={cn(
                      "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-md pointer-events-none",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    <Icon className="size-3.5" />
                  </span>

                  <div className="relative z-10 flex min-w-0 flex-col justify-center gap-0.5 pointer-events-none">
                    <div className="flex w-full items-center gap-1.5">
                      <span className="min-w-0 flex-1 text-left text-sm font-medium leading-none whitespace-nowrap">
                        {option.label}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        {selected && isBrowse ? (
                          <button
                            type="button"
                            aria-pressed={isDefault}
                            aria-label={
                              isDefault
                                ? "Открывается по умолчанию"
                                : "Открывать по умолчанию"
                            }
                            title={
                              isDefault
                                ? "Открывается по умолчанию"
                                : "Открывать по умолчанию"
                            }
                            className={cn(
                              "pointer-events-auto inline-grid size-3.5 shrink-0 place-items-center rounded-full border transition-colors",
                              isDefault
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background text-muted-foreground hover:text-foreground",
                            )}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (isEntityBrowseView(option.value)) {
                                setDefaultView(option.value);
                              }
                            }}
                          >
                            <Pin
                              className="size-2"
                              strokeWidth={2.5}
                              fill={isDefault ? "currentColor" : "none"}
                              aria-hidden
                            />
                          </button>
                        ) : null}
                        <span
                          className={cn(
                            "inline-grid size-3.5 shrink-0 place-items-center rounded-full border",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-transparent",
                          )}
                          aria-hidden
                        >
                          <Check className="size-2" strokeWidth={3} />
                        </span>
                      </div>
                    </div>
                    <span className="text-left text-[11px] leading-none whitespace-nowrap text-muted-foreground">
                      {option.description}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Отмена
        </Button>
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={() => {
            onSubmit({
              name: name.trim(),
              namePlural: namePlural.trim(),
              description: description.trim(),
              views,
              defaultView: views.includes("internal") ? null : activeDefault,
            });
            onCancel();
          }}
        >
          {isEdit ? "Сохранить" : "Добавить"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function EntityDialog({
  open,
  onOpenChange,
  entity,
  onSubmit,
}: EntityDialogProps) {
  const formKey = entity?.id ?? "new-entity";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {open ? (
          <EntityForm
            key={formKey}
            entity={entity}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
