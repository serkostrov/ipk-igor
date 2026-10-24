import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  Link2,
  Rows3,
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
  getAskRelatedLinkedTabs,
  resolveLinkedTabParentLinkFieldId,
} from "../lib/ask-related";
import {
  bridgeRelationFields,
  bridgeRelationGroupsFields,
  formatUserFieldLabel,
  formatUserFieldPathLabel,
  relationGroupsDrillOptions,
  relationTargetEntity,
  userLookupPathOptions,
  userRelationFields,
  type UserFieldPath,
  type UserFieldPathEntity,
  type UserFieldPathLinkedChild,
} from "../lib/user-field-path";

type Crumb = {
  entity: UserFieldPathEntity;
  viaFieldId: string;
  label: string;
  relationGroupsDepth?: number;
  linkedChild?: UserFieldPathLinkedChild;
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
  const groups = current
    ? bridgeRelationGroupsFields(current.entity.fields)
    : [];
  const lookups = current
    ? userLookupPathOptions(current.entity, entities)
    : [];
  const rootFull = rootEntity
    ? (entities.find((item) => item.id === rootEntity.id) ?? null)
    : null;
  const linkedTabs =
    current && crumbs.length === 1 && rootFull
      ? getAskRelatedLinkedTabs(rootFull, entities)
      : [];
  const canDrill = crumbs.length < MAX_NESTING_DEPTH;

  const filteredUsers = users.filter((field) =>
    matchesQuery(
      query,
      getEntityFieldDisplayName(field),
      formatUserFieldLabel(field),
    ),
  );
  const filteredLookups = lookups.filter((item) =>
    matchesQuery(
      query,
      getEntityFieldDisplayName(item.field),
      formatUserFieldLabel(item.field),
    ),
  );
  const filteredLinkedTabs = canDrill
    ? linkedTabs.filter(({ tab, target }) =>
        matchesQuery(
          query,
          tab.name,
          getEntityDisplayName(target),
          target.namePlural,
        ),
      )
    : [];
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
  const filteredGroupRows = canDrill
    ? groups.flatMap((field) => {
        const options = relationGroupsDrillOptions(field, entities);
        return options
          .filter((option) =>
            matchesQuery(
              query,
              getEntityFieldDisplayName(field),
              option.label,
              getEntityDisplayName(option.entity),
            ),
          )
          .map((option) => ({ field, option }));
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

  const isLookupSelected = (path: UserFieldPath) => {
    if (!value || value.kind !== "related" || path.kind !== "related") {
      return false;
    }
    if (value.fieldId !== path.fieldId) return false;
    if (value.relationPath.length !== path.relationPath.length) return false;
    if (
      value.relationPath.some((id, index) => id !== path.relationPath[index])
    ) {
      return false;
    }
    const left = value.relationGroupsDepths ?? [];
    const right = path.relationGroupsDepths ?? [];
    const max = Math.max(left.length, right.length);
    for (let i = 0; i < max; i++) {
      if ((left[i] ?? undefined) !== (right[i] ?? undefined)) return false;
    }
    return true;
  };

  function resetNav() {
    setStack([]);
    setQuery("");
  }

  function currentRelationPath(): {
    linkedChild?: UserFieldPathLinkedChild;
    relationPath: string[];
    relationGroupsDepths?: Array<number | undefined>;
  } {
    const hops = crumbs.slice(1);
    const linked = hops.find((crumb) => crumb.linkedChild)?.linkedChild;
    const fieldHops = hops.filter(
      (crumb) => crumb.viaFieldId && !crumb.linkedChild,
    );
    const relationPath = fieldHops.map((crumb) => crumb.viaFieldId);
    const depths = fieldHops.map((crumb) => crumb.relationGroupsDepth);
    const hasDepth = depths.some(
      (depth) => depth != null && Number.isFinite(depth),
    );
    return {
      ...(linked ? { linkedChild: linked } : {}),
      relationPath,
      ...(hasDepth ? { relationGroupsDepths: depths } : {}),
    };
  }

  function pickUserField(fieldId: string) {
    if (crumbs.length <= 1) {
      onChange({ kind: "direct", fieldId });
    } else {
      const { linkedChild, relationPath, relationGroupsDepths } =
        currentRelationPath();
      onChange({
        kind: "related",
        relationPath,
        fieldId,
        ...(linkedChild ? { linkedChild } : {}),
        ...(relationGroupsDepths ? { relationGroupsDepths } : {}),
      });
    }
    setOpen(false);
    resetNav();
  }

  function pickLookupPath(path: UserFieldPath) {
    if (path.kind === "related") {
      const { linkedChild } = currentRelationPath();
      onChange({
        ...path,
        ...(linkedChild && !path.linkedChild ? { linkedChild } : {}),
      });
    } else {
      onChange(path);
    }
    setOpen(false);
    resetNav();
  }

  function drillInto(
    fieldId: string,
    label: string,
    target: UserFieldPathEntity,
    relationGroupsDepth?: number,
    linkedChild?: UserFieldPathLinkedChild,
  ) {
    if (!current) return;
    setQuery("");
    const next: Crumb = {
      entity: target,
      viaFieldId: fieldId,
      label,
      ...(relationGroupsDepth != null ? { relationGroupsDepth } : {}),
      ...(linkedChild ? { linkedChild } : {}),
    };
    setStack(
      crumbs.length === 0 && rootCrumb ? [rootCrumb, next] : [...crumbs, next],
    );
  }

  function drillIntoLinkedTab(
    tabId: string,
    target: Entity,
    label: string,
    parentFieldId: string,
  ) {
    drillInto(`tab:${tabId}`, label, target, undefined, {
      tabId,
      entityId: target.id,
      parentFieldId,
      label,
    });
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
    !current ||
    (filteredUsers.length === 0 &&
      filteredLookups.length === 0 &&
      filteredLinkedTabs.length === 0 &&
      filteredBridges.length === 0 &&
      filteredGroupRows.length === 0);

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
                  ? "Нет полей с пользователями, связей и наборов"
                  : "Сущность не найдена"}
            </p>
          ) : (
            <>
              {filteredUsers.length > 0 || filteredLookups.length > 0 ? (
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
              {filteredLookups.map(({ field, path }) => {
                const checked = isLookupSelected(path);
                const bridgeName =
                  path.relationPath[0] && current
                    ? getEntityFieldDisplayName(
                        current.entity.fields.find(
                          (item) => item.id === path.relationPath[0],
                        ) ?? field,
                      )
                    : null;
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
                    onClick={() => pickLookupPath(path)}
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
                    <Layers
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {formatUserFieldLabel(field)}
                      {bridgeName ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · из «{bridgeName}»
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}

              {filteredLinkedTabs.length > 0 ? (
                <div className="px-1.5 pb-1 pt-2">
                  <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase px-1">
                    Подсущности
                  </p>
                </div>
              ) : null}
              {filteredLinkedTabs.map(({ tab, target }) => {
                if (!rootFull) return null;
                const parentFieldId = resolveLinkedTabParentLinkFieldId(
                  tab,
                  target,
                  rootFull.id,
                );
                if (!parentFieldId) return null;
                const label =
                  tab.name.trim() ||
                  getEntityDisplayName(target) ||
                  "Подсущность";
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/60"
                    onClick={() =>
                      drillIntoLinkedTab(tab.id, target, label, parentFieldId)
                    }
                  >
                    <Rows3
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {label}
                      <span className="text-muted-foreground">
                        {" "}
                        → {getEntityDisplayName(target)}
                      </span>
                    </span>
                    <ChevronRight
                      className="size-3.5 shrink-0 text-muted-foreground/70"
                      aria-hidden
                    />
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
                    disabled={!target}
                    onClick={() => {
                      if (!target) return;
                      drillInto(
                        field.id,
                        getEntityFieldDisplayName(field),
                        target,
                      );
                    }}
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

              {filteredGroupRows.length > 0 ? (
                <div className="px-1.5 pb-1 pt-2">
                  <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase px-1">
                    Наборы связей
                  </p>
                </div>
              ) : null}
              {filteredGroupRows.map(({ field, option }) => {
                const targetLabel = getEntityDisplayName(option.entity);
                return (
                  <button
                    key={`${field.id}:${option.depth}`}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/60"
                    onClick={() =>
                      drillInto(
                        field.id,
                        `${getEntityFieldDisplayName(field)} · ${option.label}`,
                        option.entity,
                        option.depth,
                      )
                    }
                  >
                    <Layers
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {getEntityFieldDisplayName(field)}
                      <span className="text-muted-foreground">
                        {" "}
                        · {option.label} → {targetLabel}
                      </span>
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
