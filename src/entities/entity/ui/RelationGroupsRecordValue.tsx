import { cn } from "@/shared/lib/cn";
import {
  getRelationGroupsDisplayTree,
  type EntityValueContext,
  type RelationGroupsDisplayNode,
} from "../model/field-value";
import type { Entity, EntityField, EntityRecord } from "../model/types";

function NodeExtras({ extras }: { extras: string }) {
  if (!extras) return null;
  return (
    <span className="min-w-0 truncate text-[11px] leading-snug font-normal text-muted-foreground">
      {extras}
    </span>
  );
}

function LeafChip({ node }: { node: RelationGroupsDisplayNode }) {
  return (
    <span
      className="inline-flex max-w-full min-w-0 items-baseline gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1"
      title={node.extras ? `${node.title} · ${node.extras}` : node.title}
    >
      <span className="min-w-0 truncate text-xs font-medium text-foreground">
        {node.title}
      </span>
      <NodeExtras extras={node.extras} />
    </span>
  );
}

function NestedList({
  nodes,
}: {
  nodes: readonly RelationGroupsDisplayNode[];
}) {
  if (nodes.length === 0) return null;
  const layout = nodes[0]?.layout ?? "column";

  if (layout === "row") {
    return (
      <div className="flex flex-wrap gap-1.5">
        {nodes.map((node) =>
          node.children.length === 0 ? (
            <LeafChip key={node.id} node={node} />
          ) : (
            <div
              key={node.id}
              className="flex min-w-0 max-w-full flex-col gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-xs font-medium">
                  {node.title}
                </span>
                <NodeExtras extras={node.extras} />
              </div>
              <NestedList nodes={node.children} />
            </div>
          ),
        )}
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5 border-l border-border/70 pl-2.5">
      {nodes.map((node) => (
        <li key={node.id} className="min-w-0">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span
              className="truncate text-xs font-medium text-foreground"
              title={node.title}
            >
              {node.title}
            </span>
            <NodeExtras extras={node.extras} />
          </div>
          {node.children.length > 0 ? (
            <div className="mt-1.5">
              <NestedList nodes={node.children} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function RootGroup({ node }: { node: RelationGroupsDisplayNode }) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span
          className="truncate text-sm font-semibold tracking-tight text-foreground"
          title={node.title}
        >
          {node.title}
        </span>
        <NodeExtras extras={node.extras} />
      </div>
      {node.children.length > 0 ? (
        <div className="mt-1.5">
          <NestedList nodes={node.children} />
        </div>
      ) : null}
    </div>
  );
}

/** Read-only structured display for a relationGroups field. */
export function RelationGroupsRecordValue({
  ctx,
  record,
  field,
  className,
}: {
  ctx: EntityValueContext;
  entity: Entity;
  record: EntityRecord;
  field: EntityField;
  className?: string;
}) {
  const tree = getRelationGroupsDisplayTree(
    ctx,
    field,
    record.values[field.id] ?? "",
  );

  if (tree.length === 0) {
    return (
      <span className={cn("text-sm text-muted-foreground/70", className)}>
        —
      </span>
    );
  }

  const rootLayout = tree[0]?.layout ?? "column";

  return (
    <div
      className={cn(
        "min-w-0",
        rootLayout === "row" ? "flex flex-wrap gap-3" : "flex flex-col gap-2.5",
        className,
      )}
    >
      {tree.map((node) => (
        <RootGroup key={node.id} node={node} />
      ))}
    </div>
  );
}
