/**
 * Relation-groups config + value helpers.
 * Exactly two levels: «Строки» (roots) and «Вложенные» (children).
 */

import type {
  EntityRelationGroupsConfig,
  EntityRelationGroupsLayout,
  EntityRelationGroupsLevel,
  EntityRelationGroupsLevelSource,
} from "./types";

/** Max nesting depth for relationGroups (0 = roots, 1 = nested). */
export const RELATION_GROUPS_MAX_DEPTH = 1;

export type EntityRelationGroupNode = {
  id: string;
  children: EntityRelationGroupNode[];
};

/**
 * Ask / form presentation:
 * - `full` — both levels
 * - `items` — only roots («Строки»)
 * - `nested` — roots + nested («Вложенные»)
 */
export type EntityRelationGroupsMode = "full" | "items" | "nested";

/** @deprecated Prefer EntityRelationGroupNode — kept for gradual migration. */
export type EntityRelationGroupItem = {
  itemId: string;
  nestedIds: string[];
  children?: Record<string, string[]>;
};

export function createRelationGroupsLevelId() {
  return `rgl-${crypto.randomUUID()}`;
}

export function createEntityRelationGroupsLevel(
  source: EntityRelationGroupsLevelSource = {
    kind: "entity",
    entityId: null,
    limitFieldId: null,
  },
): EntityRelationGroupsLevel {
  return {
    id: createRelationGroupsLevelId(),
    source,
    displayFieldIds: [],
    defaultIds: [],
    layout: "column",
  };
}

export function emptyEntityRelationGroupsConfig(): EntityRelationGroupsConfig {
  return {
    levels: [
      createEntityRelationGroupsLevel({
        kind: "entity",
        entityId: null,
        limitFieldId: null,
      }),
      createEntityRelationGroupsLevel({
        kind: "entity",
        entityId: null,
        limitFieldId: null,
      }),
    ],
  };
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id.length > 0 ? id : null;
}

function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of value) {
    const id = normalizeId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function normalizeLayout(value: unknown): EntityRelationGroupsLayout {
  return value === "row" ? "row" : "column";
}

function normalizeLevelSource(
  raw: unknown,
  allowField: boolean,
): EntityRelationGroupsLevelSource {
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    if (record.kind === "field" && allowField) {
      return { kind: "field", fieldId: normalizeId(record.fieldId) };
    }
    if (record.kind === "entity" || record.kind == null) {
      return {
        kind: "entity",
        entityId: normalizeId(record.entityId),
        limitFieldId: normalizeId(record.limitFieldId),
      };
    }
  }
  return { kind: "entity", entityId: null, limitFieldId: null };
}

function normalizeLevel(
  raw: unknown,
  index: number,
  fallbackLayout: EntityRelationGroupsLayout = "column",
): EntityRelationGroupsLevel | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id =
    normalizeId(record.id) ??
    (typeof record.id === "string" && record.id.trim()
      ? record.id.trim()
      : `rgl-${index}`);
  return {
    id,
    source: normalizeLevelSource(record.source, index > 0),
    displayFieldIds: normalizeIdList(record.displayFieldIds),
    defaultIds: normalizeIdList(record.defaultIds),
    layout:
      record.layout === "row" || record.layout === "column"
        ? record.layout
        : fallbackLayout,
  };
}

function ensureTwoLevels(
  levels: EntityRelationGroupsLevel[],
): EntityRelationGroupsLevel[] {
  const next = levels.slice(0, 2);
  while (next.length < 2) {
    next.push(
      createEntityRelationGroupsLevel({
        kind: "entity",
        entityId: null,
        limitFieldId: null,
      }),
    );
  }
  // First level must be an entity catalog.
  if (next[0]!.source.kind !== "entity") {
    next[0] = {
      ...next[0]!,
      source: { kind: "entity", entityId: null, limitFieldId: null },
    };
  }
  return next;
}

/**
 * Normalize config from storage. Accepts:
 * - `{ levels }` (extra levels beyond 2 are dropped)
 * - legacy `{ itemEntityId, nestedEntityId, … }`
 */
export function normalizeEntityRelationGroupsConfig(
  value: unknown,
): EntityRelationGroupsConfig {
  if (!value || typeof value !== "object") {
    return emptyEntityRelationGroupsConfig();
  }
  const raw = value as Record<string, unknown>;

  // Legacy top-level layout applied to levels that omit their own.
  const legacyLayout = normalizeLayout(raw.layout);

  if (Array.isArray(raw.levels) && raw.levels.length > 0) {
    const levels = raw.levels
      .map((item, index) => normalizeLevel(item, index, legacyLayout))
      .filter((item): item is EntityRelationGroupsLevel => item != null);
    return { levels: ensureTwoLevels(levels) };
  }

  // Legacy flat 2-level shape.
  const itemEntityId = normalizeId(raw.itemEntityId);
  const nestedEntityId = normalizeId(raw.nestedEntityId);
  const nestedSourceFieldId = normalizeId(raw.nestedSourceFieldId);
  const nestedFieldId = normalizeId(raw.nestedFieldId);
  const nestedKind =
    raw.nestedKind === "field" || nestedFieldId ? "field" : "entity";

  return {
    levels: ensureTwoLevels([
      {
        id: normalizeId(raw.itemLevelId) ?? "rgl-item",
        source: {
          kind: "entity",
          entityId: itemEntityId,
          limitFieldId: null,
        },
        displayFieldIds: normalizeIdList(raw.itemDisplayFieldIds),
        defaultIds: normalizeIdList(raw.defaultItemIds),
        layout: legacyLayout,
      },
      {
        id: normalizeId(raw.nestedLevelId) ?? "rgl-nested",
        source:
          nestedKind === "field"
            ? {
                kind: "field",
                fieldId: nestedFieldId ?? nestedSourceFieldId,
              }
            : {
                kind: "entity",
                entityId: nestedEntityId,
                limitFieldId: nestedSourceFieldId,
              },
        displayFieldIds: normalizeIdList(raw.nestedDisplayFieldIds),
        defaultIds: normalizeIdList(raw.defaultNestedIds),
        layout: legacyLayout,
      },
    ]),
  };
}

/** Whether every level has a usable source (for field dialog validation). */
export function isEntityRelationGroupsConfigReady(
  config: EntityRelationGroupsConfig | null | undefined,
): boolean {
  if (!config || config.levels.length < 2) return false;
  return config.levels.every((level, index) => {
    if (level.source.kind === "entity") {
      return Boolean(level.source.entityId);
    }
    return index > 0 && Boolean(level.source.fieldId);
  });
}

/** Entity id that provides records for a level (null for unresolved field). */
export function getRelationGroupsLevelEntityId(
  level: EntityRelationGroupsLevel,
  previousEntityId: string | null,
  resolveFieldTarget: (entityId: string, fieldId: string) => string | null,
): string | null {
  if (level.source.kind === "entity") return level.source.entityId;
  if (!previousEntityId || !level.source.fieldId) return null;
  return resolveFieldTarget(previousEntityId, level.source.fieldId);
}

/** Walk levels and return the leaf entity id (last resolvable). */
export function getRelationGroupsLeafEntityId(
  config: EntityRelationGroupsConfig | null | undefined,
  resolveFieldTarget: (entityId: string, fieldId: string) => string | null,
): string | null {
  if (!config || config.levels.length === 0) return null;
  let previous: string | null = null;
  let leaf: string | null = null;
  for (const level of config.levels) {
    const entityId = getRelationGroupsLevelEntityId(
      level,
      previous,
      resolveFieldTarget,
    );
    if (!entityId) break;
    leaf = entityId;
    previous = entityId;
  }
  return leaf;
}

function parseNode(raw: unknown): EntityRelationGroupNode | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  // New shape: { id, children }
  const idDirect = normalizeId(record.id);
  if (idDirect) {
    const childrenRaw = record.children;
    const children: EntityRelationGroupNode[] = [];
    const seen = new Set<string>();
    if (Array.isArray(childrenRaw)) {
      for (const child of childrenRaw) {
        const node = parseNode(child);
        if (!node || seen.has(node.id)) continue;
        seen.add(node.id);
        children.push(node);
      }
    }
    return { id: idDirect, children };
  }

  // Legacy: { itemId, nestedIds, children?: Record }
  const itemId = normalizeId(record.itemId);
  if (!itemId) return null;
  const nestedIds = normalizeIdList(record.nestedIds);
  const childrenMap =
    record.children && typeof record.children === "object"
      ? (record.children as Record<string, unknown>)
      : null;
  const children: EntityRelationGroupNode[] = nestedIds.map((nestedId) => {
    const grandchildRaw = childrenMap?.[nestedId];
    const grandchildIds = normalizeIdList(grandchildRaw);
    return {
      id: nestedId,
      children: grandchildIds.map((id) => ({ id, children: [] })),
    };
  });
  return { id: itemId, children };
}

/** Keep only roots + one nested level (drop deeper grandchildren). */
function clampRelationGroupsDepth(
  nodes: readonly EntityRelationGroupNode[],
): EntityRelationGroupNode[] {
  return nodes.map((node) => ({
    id: node.id,
    children: node.children.map((child) => ({
      id: child.id,
      children: [],
    })),
  }));
}

export function parseEntityRelationGroups(
  value: string | undefined,
): EntityRelationGroupNode[] {
  const raw = value?.trim() ?? "";
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const result: EntityRelationGroupNode[] = [];
    for (const entry of parsed) {
      const node = parseNode(entry);
      if (!node || seen.has(node.id)) continue;
      seen.add(node.id);
      result.push(node);
    }
    return clampRelationGroupsDepth(result);
  } catch {
    return [];
  }
}

export function serializeEntityRelationGroups(
  groups: readonly EntityRelationGroupNode[],
): string {
  return groups.length > 0 ? JSON.stringify(groups) : "";
}

function seedChildrenFromDefaults(
  defaultsByLevel: readonly (readonly string[])[],
  depth: number,
): EntityRelationGroupNode[] {
  const defaults = defaultsByLevel[depth] ?? [];
  if (defaults.length === 0) return [];
  return defaults.map((id) => ({
    id,
    children: seedChildrenFromDefaults(defaultsByLevel, depth + 1),
  }));
}

/** Ensure each node at `depth` has children seeded from level defaults when empty. */
function applyDefaultsAtDepth(
  nodes: EntityRelationGroupNode[],
  defaultsByLevel: readonly (readonly string[])[],
  depth: number,
): EntityRelationGroupNode[] {
  const nextDefaults = defaultsByLevel[depth + 1] ?? [];
  return nodes.map((node) => {
    if (node.children.length === 0 && nextDefaults.length > 0) {
      return {
        ...node,
        children: nextDefaults.map((id) => ({
          id,
          children: seedChildrenFromDefaults(defaultsByLevel, depth + 2),
        })),
      };
    }
    return {
      ...node,
      children: applyDefaultsAtDepth(node.children, defaultsByLevel, depth + 1),
    };
  });
}

/**
 * Build a value from root item ids.
 * - `buildEntityRelationGroupsValue(ids, nestedIds)` — legacy 2-level
 * - `buildEntityRelationGroupsValue(ids, nestedIds, childIds)` — legacy 3-level
 * - `buildEntityRelationGroupsValue(ids, levelDefaults[][])` — N-level defaults
 *   where index 0 is unused (roots come from itemIds), index 1+ are children.
 */
export function buildEntityRelationGroupsValue(
  itemIds: readonly string[],
  nestedOrLevelDefaults:
    readonly string[] | readonly (readonly string[])[] = [],
  childIds: readonly string[] = [],
): string {
  let levelDefaults: readonly (readonly string[])[];
  if (
    nestedOrLevelDefaults.length > 0 &&
    Array.isArray(nestedOrLevelDefaults[0])
  ) {
    levelDefaults = nestedOrLevelDefaults as readonly (readonly string[])[];
  } else {
    const nestedIds = nestedOrLevelDefaults as readonly string[];
    const defaults: string[][] = [[], [...nestedIds]];
    if (childIds.length > 0) defaults.push([...childIds]);
    levelDefaults = defaults;
  }
  const roots = itemIds
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
    .map((id) => ({
      id,
      children: seedChildrenFromDefaults(levelDefaults, 1),
    }));
  return serializeEntityRelationGroups(roots);
}

/** @deprecated Alias of buildEntityRelationGroupsValue with explicit child ids. */
export function buildEntityRelationGroupsValueLegacy(
  itemIds: readonly string[],
  nestedIds: readonly string[] = [],
  childIds: readonly string[] = [],
): string {
  return buildEntityRelationGroupsValue(itemIds, nestedIds, childIds);
}

/** Apply shared defaults from config onto every branch of a stored value. */
export function withEntityRelationGroupsDefaults(
  value: string,
  config: EntityRelationGroupsConfig | null | undefined,
): string {
  if (!config) return value;
  const defaults = config.levels.map((level) => level.defaultIds);
  const hasAny = defaults.some((ids, index) => index > 0 && ids.length > 0);
  if (!hasAny) return value;
  const groups = parseEntityRelationGroups(value);
  if (groups.length === 0) return value;
  return serializeEntityRelationGroups(
    applyDefaultsAtDepth(groups, defaults, 0),
  );
}

/** @deprecated Use withEntityRelationGroupsDefaults */
export function withEntityRelationGroupsDefaultNested(
  value: string,
  defaultNestedIds: readonly string[] | undefined,
  defaultChildIds: readonly string[] | undefined = undefined,
): string {
  void defaultChildIds;
  if (!defaultNestedIds || defaultNestedIds.length === 0) {
    return value;
  }
  return withEntityRelationGroupsDefaults(value, {
    levels: [
      createEntityRelationGroupsLevel(),
      {
        ...createEntityRelationGroupsLevel(),
        defaultIds: [...defaultNestedIds],
      },
    ],
  });
}

/**
 * Max level index that must be filled for `mode`.
 * `null` means both levels (`full`).
 */
export function resolveRelationGroupsModeDepth(
  mode: EntityRelationGroupsMode,
): number | null {
  if (mode === "full") return null;
  if (mode === "items") return 0;
  if (mode === "nested") return 1;
  return null;
}

function nodesFilledThrough(
  nodes: readonly EntityRelationGroupNode[],
  maxDepth: number,
  depth: number,
): boolean {
  if (nodes.length === 0) return false;
  if (depth >= maxDepth) return true;
  return nodes.every((node) =>
    nodesFilledThrough(node.children, maxDepth, depth + 1),
  );
}

/**
 * Whether a relationGroups value satisfies required validation for `mode`.
 * `levelCount` is config.levels.length (used when mode is `full`).
 */
export function isEntityRelationGroupsFilled(
  value: string | undefined,
  mode: EntityRelationGroupsMode = "full",
  levelCount = 2,
) {
  const groups = parseEntityRelationGroups(value);
  if (groups.length === 0) return false;
  const depth = resolveRelationGroupsModeDepth(mode);
  const maxDepth =
    depth == null
      ? Math.max(0, levelCount - 1)
      : Math.min(depth, levelCount - 1);
  if (maxDepth <= 0) return true;
  return nodesFilledThrough(groups, maxDepth, 0);
}

export function collectRelationGroupsLeafIds(
  nodes: readonly EntityRelationGroupNode[],
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  function walk(
    list: readonly EntityRelationGroupNode[],
    isLeafParent: boolean,
  ) {
    for (const node of list) {
      if (node.children.length === 0) {
        if (!seen.has(node.id)) {
          seen.add(node.id);
          result.push(node.id);
        }
      } else {
        walk(node.children, true);
      }
    }
    void isLeafParent;
  }
  walk(nodes, false);
  // If root has no children, roots are leaves.
  if (result.length === 0) {
    for (const node of nodes) {
      if (!seen.has(node.id)) {
        seen.add(node.id);
        result.push(node.id);
      }
    }
  }
  return result;
}

/** Collect ids at a specific depth (0 = roots). */
export function collectRelationGroupsIdsAtDepth(
  nodes: readonly EntityRelationGroupNode[],
  targetDepth: number,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  function walk(list: readonly EntityRelationGroupNode[], depth: number) {
    for (const node of list) {
      if (depth === targetDepth) {
        if (!seen.has(node.id)) {
          seen.add(node.id);
          result.push(node.id);
        }
        continue;
      }
      walk(node.children, depth + 1);
    }
  }
  walk(nodes, 0);
  return result;
}

export function mapRelationGroupsNodes(
  nodes: readonly EntityRelationGroupNode[],
  mapper: (
    node: EntityRelationGroupNode,
    depth: number,
  ) => EntityRelationGroupNode,
  depth = 0,
): EntityRelationGroupNode[] {
  return nodes.map((node) => {
    const mapped = mapper(
      {
        ...node,
        children: mapRelationGroupsNodes(node.children, mapper, depth + 1),
      },
      depth,
    );
    return mapped;
  });
}

export function updateRelationGroupsNodeChildren(
  nodes: readonly EntityRelationGroupNode[],
  path: readonly string[],
  nextChildren: EntityRelationGroupNode[],
): EntityRelationGroupNode[] {
  if (path.length === 0) return [...nextChildren];
  const [head, ...rest] = path;
  return nodes.map((node) => {
    if (node.id !== head) return node;
    if (rest.length === 0) return { ...node, children: nextChildren };
    return {
      ...node,
      children: updateRelationGroupsNodeChildren(
        node.children,
        rest,
        nextChildren,
      ),
    };
  });
}

/**
 * Drop nodes whose id is not accepted at that depth (missing / ghost records).
 * Children of removed roots are dropped with them; valid children of kept roots
 * are pruned recursively.
 */
export function pruneEntityRelationGroupsNodes(
  nodes: readonly EntityRelationGroupNode[],
  isValidId: (id: string, depth: number) => boolean,
  depth = 0,
): EntityRelationGroupNode[] {
  const result: EntityRelationGroupNode[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    const id = node.id.trim();
    if (!id || seen.has(id) || !isValidId(id, depth)) continue;
    seen.add(id);
    result.push({
      id,
      children: pruneEntityRelationGroupsNodes(
        node.children,
        isValidId,
        depth + 1,
      ),
    });
  }
  return result;
}

/** Serialize after pruning; returns `""` when nothing valid remains. */
export function pruneEntityRelationGroupsValue(
  value: string,
  isValidId: (id: string, depth: number) => boolean,
): string {
  return serializeEntityRelationGroups(
    pruneEntityRelationGroupsNodes(parseEntityRelationGroups(value), isValidId),
  );
}
