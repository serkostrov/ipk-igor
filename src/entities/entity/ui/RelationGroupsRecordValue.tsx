import { useState } from "react";
import { cn } from "@/shared/lib/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
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

function DetailBranch({
  nodes,
  depth = 0,
}: {
  nodes: readonly RelationGroupsDisplayNode[];
  depth?: number;
}) {
  if (nodes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Нет вложенных записей</p>
    );
  }

  return (
    <ul
      className={cn(
        "flex flex-col gap-1",
        depth > 0 && "mt-1 border-l border-border/70 pl-2.5",
      )}
    >
      {nodes.map((node) => (
        <li key={node.id} className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span
              className={cn(
                "min-w-0 truncate text-sm text-foreground",
                depth === 0 ? "font-medium" : "font-normal",
              )}
              title={node.title}
            >
              {node.title}
            </span>
            <NodeExtras extras={node.extras} />
          </div>
          {node.children.length > 0 ? (
            <DetailBranch nodes={node.children} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Read-only: chips in a row; click opens what belongs to that group. */
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
  const [openId, setOpenId] = useState<string | null>(null);
  const tree = getRelationGroupsDisplayTree(
    ctx,
    field,
    record.values[field.id] ?? "",
  );
  const openNode = openId
    ? (tree.find((node) => node.id === openId) ?? null)
    : null;

  if (tree.length === 0) {
    return (
      <span className={cn("text-sm text-muted-foreground/70", className)}>
        —
      </span>
    );
  }

  return (
    <>
      <div
        className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}
      >
        {tree.map((node) => (
          <button
            key={node.id}
            type="button"
            className="inline-flex h-5 max-w-full shrink-0 items-center rounded-md bg-primary/10 px-1.5 text-xs font-medium leading-none text-primary transition-colors hover:bg-primary/15"
            title={node.extras ? `${node.title} · ${node.extras}` : node.title}
            onClick={() => setOpenId(node.id)}
          >
            <span className="truncate">{node.title}</span>
          </button>
        ))}
      </div>

      <Dialog
        open={openNode != null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
      >
        <DialogContent className="sm:max-w-md" forceOverlay>
          {openNode ? (
            <>
              <DialogHeader>
                <DialogTitle>{openNode.title}</DialogTitle>
                <DialogDescription>
                  {openNode.extras
                    ? openNode.extras
                    : openNode.children.length > 0
                      ? "Что входит в эту группу"
                      : "Нет вложенных записей"}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 max-h-[min(60vh,24rem)] overflow-y-auto">
                <DetailBranch nodes={openNode.children} />
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
