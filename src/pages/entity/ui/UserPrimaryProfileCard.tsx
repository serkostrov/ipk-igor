import { Camera } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import { getPersonInitials } from "@/shared/lib/person";
import {
  formatEntityFieldScalarValue,
  getEntityFieldDisplayName,
  getEntityListOptions,
  getEntityListParentField,
  getEntityRelationTargetId,
  getVisibleListOptions,
  parseEntityRelationIds,
  resolveEntityListFieldPresentation,
  resolveRelationRecordLabel,
  type Entity,
  type EntityField,
} from "@/entities/entity";

type UserPrimaryProfileCardProps = {
  name: string;
  fields: EntityField[];
  values: Record<string, string>;
  entity: Entity;
  entities: Entity[];
  onEdit?: () => void;
  onOpenRelation?: (entityId: string, recordId: string) => void;
};

type ProfileChip = {
  key: string;
  field: EntityField;
  label: string;
  kind: "relation" | "list" | "other";
  color?: string | null;
  relationTargetId?: string | null;
  recordId?: string;
};

function buildProfileChips(
  fields: EntityField[],
  values: Record<string, string>,
  entity: Entity,
  entities: Entity[],
): ProfileChip[] {
  const chips: ProfileChip[] = [];

  for (const field of fields) {
    const raw = values[field.id];

    if (field.type === "relation") {
      const targetId = getEntityRelationTargetId(field);
      const target = targetId
        ? (entities.find((item) => item.id === targetId) ?? null)
        : null;
      for (const recordId of parseEntityRelationIds(raw)) {
        const label = resolveRelationRecordLabel(target, recordId)?.trim();
        if (!label) continue;
        chips.push({
          key: `${field.id}:${recordId}`,
          field,
          label,
          kind: "relation",
          relationTargetId: targetId,
          recordId,
        });
      }
      continue;
    }

    if (field.type === "list") {
      const parentField = getEntityListParentField(entity, field);
      const parentValue = parentField ? values[parentField.id] : undefined;
      const options = getVisibleListOptions(
        field,
        parentValue,
        parentField,
        entities,
      );
      const { listUseColors } = resolveEntityListFieldPresentation(
        field,
        entities,
      );
      const selected = getEntityListOptions(options, raw);
      for (const option of selected) {
        chips.push({
          key: `${field.id}:${option.id}`,
          field,
          label: option.name,
          kind: "list",
          color: listUseColors ? option.color : null,
        });
      }
      continue;
    }

    if (
      field.type === "text" ||
      field.type === "textarea" ||
      field.type === "phone" ||
      field.type === "email" ||
      field.type === "url" ||
      field.type === "number" ||
      field.type === "datetime"
    ) {
      const display = formatEntityFieldScalarValue(field, raw);
      if (display === "—") continue;
      chips.push({
        key: field.id,
        field,
        label: display,
        kind: "other",
      });
      continue;
    }

    const trimmed = (raw ?? "").trim();
    if (!trimmed) continue;
    chips.push({
      key: field.id,
      field,
      label: trimmed,
      kind: "other",
    });
  }

  return chips;
}

function ProfileMetaChip({
  chip,
  onOpenRelation,
}: {
  chip: ProfileChip;
  onOpenRelation?: (entityId: string, recordId: string) => void;
}) {
  const title = `${getEntityFieldDisplayName(chip.field)}: ${chip.label}`;
  const canOpen =
    chip.kind === "relation" &&
    chip.relationTargetId != null &&
    chip.recordId != null &&
    onOpenRelation != null;

  const listColored = chip.kind === "list" && chip.color != null;
  const className = cn(
    "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
    listColored
      ? "border border-black/5 text-foreground"
      : chip.kind === "list"
        ? "bg-muted text-foreground"
        : chip.kind === "relation"
          ? "bg-primary/10 text-primary"
          : "bg-background text-muted-foreground",
    canOpen &&
      "cursor-pointer transition-colors hover:bg-primary/15 hover:text-primary",
  );

  const content = <span className="truncate">{chip.label}</span>;

  const colorStyle = listColored
    ? { backgroundColor: `${chip.color}28` }
    : undefined;

  if (canOpen) {
    return (
      <button
        type="button"
        className={className}
        style={colorStyle}
        title={title}
        onClick={() => onOpenRelation?.(chip.relationTargetId!, chip.recordId!)}
      >
        {content}
      </button>
    );
  }

  return (
    <span className={className} style={colorStyle} title={title}>
      {content}
    </span>
  );
}

export function UserPrimaryProfileCard({
  name,
  fields,
  values,
  entity,
  entities,
  onEdit,
  onOpenRelation,
}: UserPrimaryProfileCardProps) {
  const initials = getPersonInitials(name);
  const chips = buildProfileChips(fields, values, entity, entities);

  return (
    <section className="rounded-xl border border-border bg-muted/40 px-5 py-5 sm:px-6 sm:py-6">
      <div className="flex items-center gap-4 sm:gap-5">
        <div className="relative shrink-0">
          <div
            className="flex size-16 items-center justify-center rounded-full bg-background text-lg font-semibold tracking-tight text-foreground sm:size-[4.5rem] sm:text-xl"
            aria-hidden
          >
            {initials}
          </div>
          {onEdit ? (
            <Button
              type="button"
              size="icon-sm"
              className="absolute -right-0.5 -bottom-0.5 size-7 rounded-full shadow-xs"
              aria-label="Редактировать профиль"
              title="Редактировать профиль"
              onClick={onEdit}
            >
              <Camera className="size-3.5" />
            </Button>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {name}
          </h2>

          {chips.length > 0 ? (
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
              {chips.map((chip) => (
                <ProfileMetaChip
                  key={chip.key}
                  chip={chip}
                  onOpenRelation={onOpenRelation}
                />
              ))}
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-muted-foreground/70">
              Заполните поля в группе «Основное»
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
