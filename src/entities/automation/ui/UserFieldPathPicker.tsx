import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Link2,
  UserRound,
} from "lucide-react";
import {
  getEntityDisplayName,
  getEntityFieldDisplayName,
  type Entity,
} from "@/entities/entity";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { cn } from "@/shared/lib/cn";
import {
  bridgeRelationFields,
  formatUserFieldLabel,
  formatUserFieldPathLabel,
  relationTargetEntity,
  userRelationFields,
  type UserFieldPath,
  type UserFieldPathEntity,
} from "../lib/user-field-path";

type Crumb = {
  entity: UserFieldPathEntity;
  viaFieldId: string;
  label: string;
};

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

function matchesQuery(query: string, ...parts: Array<string | undefined>) {
  const needle = normalizeSearch(query);
  if (!needle) return true;
  return normalizeSearch(parts.filter(Boolean).join(" ")).includes(needle);
}

const MAX_NESTING_DEPTH = 6;

type UserFieldPathPickerProps = {
  rootEntity: UserFieldPathEntity | null;
  entities: Entity[];
  value: UserFieldPath | null;
  onChange: (next: UserFieldPath) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

export function UserFieldPathPicker({
  rootEntity,
  entities,
  value,
  onChange,
  placeholder = "Выберите поле",
  className,
  disabled,
}: UserFieldPathPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [stack, setStack] = useState<Crumb[]>([]);

  const rootCrumb = useMemo<Crumb | null>(() => {
    if (!rootEntity) return null;
    return {
      entity: rootEntity,
      viaFieldId: "",
      label: "Эта запись",
    };
  }, [rootEntity]);

  const crumbs = stack.length > 0 ? stack : rootCrumb ? [rootCrumb] : [];
  const current = crumbs[crumbs.length - 1] ?? null;

  const display = formatUserFieldPathLabel(value, rootEntity, entities);

  const users = current ? userRelationFields(current.entity.fields) : [];
  const bridges = current ? bridgeRelationFields(current.entity.fields) : [];
  const canDrill = crumbs.length < MAX_NESTING_DEPTH;

  const filteredUsers = users.filter((field) =>
    matchesQuery(
      query,
      getEntityFieldDisplayName(field),
      formatUserFieldLabel(field),
    ),
  );
  const filteredBridges = canDrill
    ? bridges.filter((field) => {
        const target = relationTargetEntity(field, entities);
        return matchesQuery(
          query,
          getEntityFieldDisplayName(field),
          target ? getEntityDisplayName(target) : undefined,
        );
      })
    : [];

  const isSelected = (fieldId: string) => {
    if (!value || !current) return false;
    if (value.kind === "direct") {
      return crumbs.length === 1 && value.fieldId === fieldId;
    }
    const relationPath = crumbs
      .slice(1)
      .map((crumb) => crumb.viaFieldId)
      .filter(Boolean);
    if (relationPath.length !== value.relationPath.length) return false;
    if (relationPath.some((id, index) => id !== value.relationPath[index])) {
      return false;
    }
    return value.fieldId === fieldId;
  };

  function resetNav() {
    setStack([]);
    setQuery("");
  }

  function pickUserField(fieldId: string) {
    if (crumbs.length <= 1) {
      onChange({ kind: "direct", fieldId });
    } else {
      const relationPath = crumbs
        .slice(1)
        .map((crumb) => crumb.viaFieldId)
        .filter(Boolean);
      onChange({ kind: "related", relationPath, fieldId });
    }
    setOpen(false);
    resetNav();
  }

  function drillInto(fieldId: string, label: string) {
    const field = current?.entity.fields.find((item) => item.id === fieldId);
    if (!field || !current) return;
    const target = relationTargetEntity(field, entities);
    if (!target) return;
    setQuery("");
    const next: Crumb = {
      entity: target,
      viaFieldId: field.id,
      label,
    };
    setStack(
      crumbs.length === 0 && rootCrumb ? [rootCrumb, next] : [...crumbs, next],
    );
  }

  function goToCrumb(index: number) {
    if (index <= 0) {
      setStack([]);
      setQuery("");
      return;
    }
    setStack(crumbs.slice(0, index + 1));
    setQuery("");
  }

  const empty =
    !current || (filteredUsers.length === 0 && filteredBridges.length === 0);

  return (
    <Popover
      open={disabled ? false : open}
      onOpenChange={(next) => {
        if (disabled) return;
        setOpen(next);
        if (!next) resetNav();
      }}
    >
      <PopoverTrigger
        disabled={disabled || !rootEntity}
        aria-label={placeholder}
        render={
          <Button
            type="button"
            variant="outline"
            disabled={disabled || !rootEntity}
            className={cn(
              "h-9 w-full min-w-0 items-center justify-between gap-2 overflow-hidden border-input bg-background px-2.5 py-0 font-normal shadow-xs hover:bg-background",
              !display && "text-muted-foreground",
              className,
            )}
          />
        }
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {display ?? placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[min(22rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0"
        sideOffset={6}
      >
        <div className="border-b border-border/70 p-2">
          {crumbs.length > 1 ? (
            <div className="mb-2 flex min-w-0 items-center gap-0.5">
              <button
                type="button"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Назад"
                onClick={() => goToCrumb(crumbs.length - 2)}
              >
                <ChevronLeft className="size-4" />
              </button>
              <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-[11px] text-muted-foreground">
                {crumbs.map((crumb, index) => {
                  const isLast = index === crumbs.length - 1;
                  return (
                    <span
                      key={`${crumb.viaFieldId}-${index}`}
                      className="flex min-w-0 items-center gap-0.5"
                    >
                      {index > 0 ? (
                        <ChevronRight className="size-3 shrink-0 opacity-50" />
                      ) : null}
                      {isLast ? (
                        <span className="truncate font-medium text-foreground">
                          {crumb.label}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="truncate rounded px-0.5 hover:text-foreground"
                          onClick={() => goToCrumb(index)}
                        >
                          {crumb.label}
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}
          <Input
            value={query}
            placeholder="Поиск…"
            className="h-8"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="max-h-64 overflow-y-auto p-1">
          {empty ? (
            <p className="px-2.5 py-3 text-center text-xs text-muted-foreground">
              {query.trim()
                ? "Ничего не найдено"
                : current
                  ? "Нет полей с пользователями и связей для перехода"
                  : "Сущность не найдена"}
            </p>
          ) : (
            <>
              {filteredUsers.length > 0 ? (
                <div className="px-1.5 pb-1 pt-1.5">
                  <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase px-1">
                    {crumbs.length > 1 ? "Пользователи" : "На этой записи"}
                  </p>
                </div>
              ) : null}
              {filteredUsers.map((field) => {
                const checked = isSelected(field.id);
                return (
                  <button
                    key={field.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                      checked
                        ? "bg-primary/8 text-foreground"
                        : "text-foreground hover:bg-muted/60",
                    )}
                    onClick={() => pickUserField(field.id)}
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background",
                      )}
                      aria-hidden
                    >
                      {checked ? <Check className="size-3" /> : null}
                    </span>
                    <UserRound
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {formatUserFieldLabel(field)}
                    </span>
                  </button>
                );
              })}

              {filteredBridges.length > 0 ? (
                <div className="px-1.5 pb-1 pt-2">
                  <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase px-1">
                    Связанные записи
                  </p>
                </div>
              ) : null}
              {filteredBridges.map((field) => {
                const target = relationTargetEntity(field, entities);
                const targetLabel = target
                  ? getEntityDisplayName(target)
                  : null;
                return (
                  <button
                    key={field.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/60"
                    onClick={() =>
                      drillInto(field.id, getEntityFieldDisplayName(field))
                    }
                  >
                    <Link2
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {getEntityFieldDisplayName(field)}
                      {targetLabel ? (
                        <span className="text-muted-foreground">
                          {" "}
                          → {targetLabel}
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight
                      className="size-3.5 shrink-0 text-muted-foreground/70"
                      aria-hidden
                    />
                  </button>
                );
              })}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
