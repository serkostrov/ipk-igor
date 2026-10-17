import { useEffect, useCallback, memo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getSmoothStepPath,
  getStraightPath,
  useEdgesState,
  useInternalNode,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type InternalNode,
  type IsValidConnection,
  type Node,
  type NodeProps,
  type NodeTypes,
  type OnConnect,
  type OnEdgesDelete,
  type OnNodeDrag,
  type OnReconnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Eye,
  EyeOff,
  Flag,
  GitBranch,
  ListOrdered,
  Lock,
  Plus,
  Timer,
  User,
  Zap,
} from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type {
  AutomationCanvasNodePositions,
  AutomationLaunchPhase,
  AutomationStageTaskRelease,
  AutomationStageTaskReleaseMap,
  AutomationStageTransition,
  AutomationTaskTemplate,
} from "@/entities/automation";
import {
  AUTOMATION_ASSIGNEE_TYPE_LABELS,
  getStageTaskRelease,
} from "@/entities/automation";
import type { EntityField } from "@/entities/entity";
import { TemplateRichText } from "./TemplateRichText";

const COL_W = 220;
const COL_GAP = 36;
const ORIGIN_X = 32;
const STAGE_Y = 28;
const FLOW_Y = 130;
const ROW_GAP = 40;
const TASK_H = 92;
const TRIGGER_H = 72;
const TRIGGER_H_WITH_RELEASE = 108;

const HANDLE_CLASS =
  "!size-2 !border-2 !border-background !bg-muted-foreground/35 !opacity-0";

/** Visible target for stage→stage drag connections. */
const STAGE_IN_HANDLE =
  "!size-2.5 !border-2 !border-background !bg-slate-400 opacity-70 transition-all hover:opacity-100 hover:!bg-primary hover:!scale-110";

/** Source handle for «тогда» branch. */
const STAGE_THEN_HANDLE =
  "!size-2.5 !border-2 !border-background !bg-emerald-500 opacity-80 transition-all hover:opacity-100 hover:!scale-110";

/** Source handle for «иначе» branch. */
const STAGE_ELSE_HANDLE =
  "!size-2.5 !border-2 !border-background !bg-amber-500 opacity-80 transition-all hover:opacity-100 hover:!scale-110";

const STAGE_MAP_MARKER = {
  type: MarkerType.ArrowClosed,
  width: 16,
  height: 16,
  color: "#64748b",
} as const;

const STAGE_ELSE_MARKER = {
  type: MarkerType.ArrowClosed,
  width: 16,
  height: 16,
  color: "#f59e0b",
} as const;

type InsertData = {
  stageId: string;
  launchPhase: AutomationLaunchPhase;
  insertAt: number;
};

function parseStageNodeId(nodeId: string): string | null {
  if (!nodeId.startsWith("stage:")) return null;
  const id = nodeId.slice("stage:".length).trim();
  return id || null;
}

function isElseSourceHandle(handleId: string | null | undefined) {
  return handleId === "else";
}

function nodeBounds(node: InternalNode) {
  const { width = COL_W, height = TASK_H } = node.measured ?? {};
  const { x, y } = node.internals.positionAbsolute;
  return {
    x,
    y,
    width,
    height,
    cx: x + width / 2,
    cy: y + height / 2,
  };
}

/**
 * Axis-aligned ports (column = top/bottom, row = left/right).
 * Avoids diamond-intersection attaching to the sides of wide insert strips.
 */
function getAlignedEdgeParams(source: InternalNode, target: InternalNode) {
  const s = nodeBounds(source);
  const t = nodeBounds(target);
  const dx = t.cx - s.cx;
  const dy = t.cy - s.cy;

  if (Math.abs(dy) >= Math.abs(dx)) {
    if (dy >= 0) {
      return {
        sx: s.cx,
        sy: s.y + s.height,
        tx: t.cx,
        ty: t.y,
        sourcePos: Position.Bottom,
        targetPos: Position.Top,
        vertical: true as const,
      };
    }
    return {
      sx: s.cx,
      sy: s.y,
      tx: t.cx,
      ty: t.y + t.height,
      sourcePos: Position.Top,
      targetPos: Position.Bottom,
      vertical: true as const,
    };
  }

  if (dx >= 0) {
    return {
      sx: s.x + s.width,
      sy: s.cy,
      tx: t.x,
      ty: t.cy,
      sourcePos: Position.Right,
      targetPos: Position.Left,
      vertical: false as const,
    };
  }
  return {
    sx: s.x,
    sy: s.cy,
    tx: t.x + t.width,
    ty: t.cy,
    sourcePos: Position.Left,
    targetPos: Position.Right,
    vertical: false as const,
  };
}

type InsertPosition = { x: number; y: number };

type FloatingEdgeData = {
  insert?: InsertData;
  /** Place the new task at the edge midpoint (card top-left). */
  onAdd?: (position: InsertPosition) => void;
  /** Visual hint on edges between onEnter tasks. */
  chainHint?: AutomationStageTaskRelease | null;
};

function FloatingEdge({
  id,
  source,
  target,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const edgeData = (data ?? {}) as FloatingEdgeData;

  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty, sourcePos, targetPos, vertical } =
    getAlignedEdgeParams(sourceNode, targetNode);

  const aligned = vertical ? Math.abs(sx - tx) < 1.5 : Math.abs(sy - ty) < 1.5;

  const [edgePath, labelX, labelY] = aligned
    ? getStraightPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty })
    : getSmoothStepPath({
        sourceX: sx,
        sourceY: sy,
        sourcePosition: sourcePos,
        targetX: tx,
        targetY: ty,
        targetPosition: targetPos,
        borderRadius: 10,
      });

  const insert = edgeData.insert;
  const chainHint = edgeData.chainHint ?? null;
  const addLabel =
    insert?.launchPhase === "beforeEnter"
      ? "Добавить задачу до старта"
      : "Добавить задачу";

  const edgeStyle = {
    ...style,
    ...(chainHint === "parallel"
      ? { strokeDasharray: "5 4", stroke: style?.stroke ?? "#a1a1aa" }
      : null),
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={edgeStyle}
      />
      {insert || chainHint ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan group pointer-events-auto absolute z-20 flex flex-col items-center gap-1"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {chainHint ? (
              <span
                className={cn(
                  "rounded-md border bg-card px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase shadow-xs",
                  chainHint === "sequential"
                    ? "border-border/70 text-muted-foreground"
                    : "border-sky-500/30 text-sky-700 dark:text-sky-400",
                )}
              >
                {chainHint === "sequential" ? "затем" : "сразу"}
              </span>
            ) : null}
            {insert ? (
              <div className="relative flex min-h-6 min-w-6 items-center justify-center">
                <button
                  type="button"
                  title={addLabel}
                  aria-label={addLabel}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full border border-border/90 bg-card text-muted-foreground shadow-sm transition-all",
                    "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                    "hover:scale-110 hover:border-primary/50 hover:bg-primary/[0.06] hover:text-primary",
                    chainHint && "opacity-70",
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    // Card top-left so the node sits on the «+» between neighbours.
                    edgeData.onAdd?.({
                      x: labelX - COL_W / 2,
                      y: labelY - TASK_H / 2,
                    });
                  }}
                >
                  <Plus className="size-3.5" strokeWidth={2.25} aria-hidden />
                </button>
              </div>
            ) : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

type StageMapEdgeData = {
  fromOptionId: string;
  toOptionId: string;
  configured: boolean;
  selected: boolean;
  elseLabel?: string;
  onOpen?: () => void;
};

type StageElseEdgeData = {
  fromOptionId: string;
  toOptionId: string;
  selected: boolean;
  onOpen?: () => void;
};

/** Map link between stages — mid control opens the transition inspector. */
function StageMapEdge({
  id,
  source,
  target,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const edgeData = (data ?? {}) as StageMapEdgeData;

  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty, sourcePos, targetPos, vertical } =
    getAlignedEdgeParams(sourceNode, targetNode);
  const aligned = vertical ? Math.abs(sx - tx) < 1.5 : Math.abs(sy - ty) < 1.5;

  const [edgePath] = aligned
    ? getStraightPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty })
    : getSmoothStepPath({
        sourceX: sx,
        sourceY: sy,
        sourcePosition: sourcePos,
        targetX: tx,
        targetY: ty,
        targetPosition: targetPos,
        borderRadius: 12,
      });

  const labelX = (sx + tx) / 2;
  const labelY = (sy + ty) / 2;
  const configured = edgeData.configured === true;
  const selected = edgeData.selected === true;
  const elseLabel = edgeData.elseLabel?.trim() ?? "";

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: selected
            ? "var(--primary)"
            : configured
              ? "#64748b"
              : (style?.stroke ?? "#d4d4d8"),
          strokeWidth: selected || configured ? 2 : 1.5,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute z-20 flex flex-col items-center gap-1"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          <button
            type="button"
            title={
              configured
                ? "Изменить условие перехода"
                : "Добавить условие перехода"
            }
            aria-label={
              configured
                ? "Изменить условие перехода"
                : "Добавить условие перехода"
            }
            className={cn(
              "flex size-7 items-center justify-center rounded-full border bg-card shadow-sm transition-all",
              "hover:scale-105 hover:border-primary/50 hover:text-primary hover:shadow-md",
              selected
                ? "border-primary text-primary ring-2 ring-primary/25"
                : configured
                  ? "border-border text-foreground"
                  : "border-border/80 text-muted-foreground opacity-90 hover:opacity-100",
            )}
            onClick={(event) => {
              event.stopPropagation();
              edgeData.onOpen?.();
            }}
          >
            {configured ? (
              <GitBranch className="size-3.5" aria-hidden />
            ) : (
              <Plus className="size-3.5" strokeWidth={2.25} aria-hidden />
            )}
          </button>
          {configured ? (
            <span
              className={cn(
                "max-w-[11rem] truncate rounded-md border bg-card px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase shadow-xs",
                selected
                  ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                  : "border-border/70 text-muted-foreground",
              )}
            >
              тогда
              {elseLabel ? ` · иначе → ${elseLabel}` : ""}
            </span>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

/** Redirect edge when conditions fail («иначе»). */
function StageElseEdge({ id, source, target, markerEnd, data }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const edgeData = (data ?? {}) as StageElseEdgeData;

  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty, sourcePos, targetPos } = getAlignedEdgeParams(
    sourceNode,
    targetNode,
  );
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
    borderRadius: 14,
    offset: 28,
  });
  const selected = edgeData.selected === true;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? "#d97706" : "#f59e0b",
          strokeWidth: selected ? 2 : 1.75,
          strokeDasharray: "6 4",
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute z-20"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          <button
            type="button"
            title="Ветка «иначе» — открыть условие"
            aria-label="Ветка иначе"
            className={cn(
              "rounded-md border bg-card px-2 py-0.5 text-[9px] font-semibold tracking-wide uppercase shadow-sm transition-all",
              "hover:border-amber-500/50 hover:text-amber-700",
              selected
                ? "border-amber-500 text-amber-700 ring-2 ring-amber-500/20 dark:text-amber-400"
                : "border-amber-500/35 text-amber-700/90 dark:text-amber-400/90",
            )}
            onClick={(event) => {
              event.stopPropagation();
              edgeData.onOpen?.();
            }}
          >
            иначе
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes: EdgeTypes = {
  floating: memo(FloatingEdge),
  stageMap: memo(StageMapEdge),
  stageElse: memo(StageElseEdge),
};

type StageOption = { id: string; name: string; color?: string };

type StageData = {
  stage: StageOption;
  taskCount: number;
  active: boolean;
  collapsed: boolean;
  hasTransitionRule: boolean;
  onToggleCollapse: () => void;
};
type TaskData = {
  template: AutomationTaskTemplate;
  selected: boolean;
  fields: EntityField[];
};
function StageNode({ data }: NodeProps<Node<StageData, "stage">>) {
  const taskLabel =
    data.taskCount === 0
      ? "Нет задач"
      : data.taskCount === 1
        ? "1 задача"
        : `${data.taskCount} задач`;

  return (
    <div
      className={cn(
        "group/stage relative flex h-[56px] w-[220px] cursor-grab flex-col justify-center rounded-xl border bg-card px-3 pr-9 shadow-sm active:cursor-grabbing",
        data.active ? "border-primary ring-2 ring-primary/20" : "border-border",
        data.collapsed && "border-dashed bg-muted/30",
      )}
    >
      {/* Layout-only ports for intra-column floating edges */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        isConnectable={false}
        className={HANDLE_CLASS}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="out-bottom"
        isConnectable={false}
        className={HANDLE_CLASS}
      />
      {/* Stage→stage connection ports */}
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        isConnectable
        title="Входящий переход"
        className={STAGE_IN_HANDLE}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="then"
        isConnectable
        title="Соединить «тогда»"
        className={STAGE_THEN_HANDLE}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="else"
        isConnectable
        title="Соединить «иначе»"
        className={cn(STAGE_ELSE_HANDLE, "!-bottom-1.5")}
        style={{ left: "72%" }}
      />
      <div className="flex items-center gap-2">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: data.stage.color || "var(--primary)" }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{data.stage.name}</p>
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="truncate">
              {data.collapsed ? `${taskLabel} · скрыто` : taskLabel}
            </span>
            {data.hasTransitionRule ? (
              <span
                title="Настроен переход дальше"
                className="inline-flex shrink-0 items-center text-primary"
              >
                <GitBranch className="size-2.5" aria-hidden />
              </span>
            ) : null}
          </p>
        </div>
      </div>
      <button
        type="button"
        className={cn(
          "nodrag nopan absolute top-1/2 right-1.5 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors",
          "hover:bg-muted hover:text-foreground",
          data.collapsed && "text-foreground",
        )}
        aria-pressed={data.collapsed}
        aria-label={
          data.collapsed
            ? "Показать содержимое стадии"
            : "Скрыть содержимое стадии"
        }
        title={
          data.collapsed
            ? "Показать задачи, старт и «Готово»"
            : "Скрыть задачи, старт и «Готово»"
        }
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          data.onToggleCollapse();
        }}
      >
        {data.collapsed ? (
          <EyeOff className="size-3.5" strokeWidth={2} />
        ) : (
          <Eye className="size-3.5" strokeWidth={2} />
        )}
      </button>
    </div>
  );
}

type TriggerData = {
  stageId: string;
  /** Show release toggle when the stage has 2+ onEnter tasks. */
  showReleaseToggle: boolean;
  taskRelease: AutomationStageTaskRelease;
  onTaskReleaseChange: (mode: AutomationStageTaskRelease) => void;
};

function TriggerNode({ data }: NodeProps<Node<TriggerData, "trigger">>) {
  const height = data.showReleaseToggle ? TRIGGER_H_WITH_RELEASE : TRIGGER_H;
  return (
    <div
      className="flex w-[220px] cursor-grab flex-col justify-center gap-2 rounded-xl border border-amber-500/30 bg-card px-3 py-2.5 shadow-sm active:cursor-grabbing"
      style={{ minHeight: height }}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        isConnectable={false}
        className={HANDLE_CLASS}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        isConnectable={false}
        className={HANDLE_CLASS}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right"
        isConnectable={false}
        className={HANDLE_CLASS}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom"
        isConnectable={false}
        className={HANDLE_CLASS}
      />
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600">
          <Zap className="size-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold">Старт</p>
          <p className="truncate text-[10px] text-muted-foreground">
            Попадание на стадию
          </p>
        </div>
      </div>
      {data.showReleaseToggle ? (
        <div
          className="nodrag nopan flex rounded-lg border border-border/80 bg-muted/40 p-0.5"
          role="group"
          aria-label="Порядок задач"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            title="Все задачи появляются сразу"
            aria-pressed={data.taskRelease === "parallel"}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors",
              data.taskRelease === "parallel"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={(event) => {
              event.stopPropagation();
              data.onTaskReleaseChange("parallel");
            }}
          >
            <GitBranch className="size-3 rotate-90" aria-hidden />
            Сразу
          </button>
          <button
            type="button"
            title="Следующая задача — после завершения предыдущей"
            aria-pressed={data.taskRelease === "sequential"}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors",
              data.taskRelease === "sequential"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={(event) => {
              event.stopPropagation();
              data.onTaskReleaseChange("sequential");
            }}
          >
            <ListOrdered className="size-3" aria-hidden />
            По очереди
          </button>
        </div>
      ) : null}
      <Handle
        type="source"
        position={Position.Top}
        id="out-top"
        isConnectable={false}
        className={HANDLE_CLASS}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="out-left"
        isConnectable={false}
        className={HANDLE_CLASS}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out-right"
        isConnectable={false}
        className={HANDLE_CLASS}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="out-bottom"
        isConnectable={false}
        className={HANDLE_CLASS}
      />
    </div>
  );
}

function TaskNode({ data }: NodeProps<Node<TaskData, "task">>) {
  const { template, selected, fields } = data;
  return (
    <div
      className={cn(
        "flex min-h-[92px] w-[220px] cursor-grab flex-col justify-center rounded-xl border bg-card px-3 py-2.5 shadow-sm transition-shadow active:cursor-grabbing",
        selected
          ? "border-primary ring-2 ring-primary/25"
          : "border-border hover:border-foreground/20",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className={HANDLE_CLASS}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className={HANDLE_CLASS}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right"
        className={HANDLE_CLASS}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom"
        className={HANDLE_CLASS}
      />
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0 overflow-hidden">
          <p className="truncate text-xs font-semibold leading-snug">
            {template.name.trim() ? (
              <TemplateRichText value={template.name} fields={fields} />
            ) : (
              "Без названия"
            )}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            #{template.stepOrder}
            {(template.launchPhase ?? "onEnter") === "beforeEnter"
              ? " · до старта"
              : ""}
            {template.kind === "decision"
              ? " · решение"
              : template.kind === "autofill"
                ? " · автозаполнение"
                : template.kind === "single"
                  ? " · кнопка"
                  : ""}
          </p>
        </div>
        {template.isBlocking ? (
          <Lock className="size-3 shrink-0 text-muted-foreground" />
        ) : null}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1 text-[9px] text-muted-foreground">
        <span className="inline-flex items-center gap-0.5 rounded-md bg-muted px-1 py-0.5">
          <User className="size-2.5" />
          {AUTOMATION_ASSIGNEE_TYPE_LABELS[template.assignee.type]}
        </span>
        {template.sla ? (
          <span className="inline-flex items-center gap-0.5 rounded-md bg-muted px-1 py-0.5">
            <Timer className="size-2.5" />
            {template.sla.hours}ч
          </span>
        ) : null}
        {template.outcomes.length > 0 ? (
          <span className="inline-flex items-center gap-0.5 rounded-md bg-muted px-1 py-0.5">
            <Flag className="size-2.5" />
            {template.outcomes.length}
          </span>
        ) : null}
      </div>
      <Handle
        type="source"
        position={Position.Top}
        id="out-top"
        className={HANDLE_CLASS}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="out-left"
        className={HANDLE_CLASS}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out-right"
        className={HANDLE_CLASS}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="out-bottom"
        className={HANDLE_CLASS}
      />
    </div>
  );
}

function EndNode() {
  return (
    <div className="relative flex h-10 w-[140px] cursor-grab items-center justify-center rounded-xl border border-emerald-500/30 bg-card text-[11px] font-semibold text-emerald-700 shadow-sm active:cursor-grabbing dark:text-emerald-400">
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className={HANDLE_CLASS}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className={HANDLE_CLASS}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right"
        className={HANDLE_CLASS}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom"
        className={HANDLE_CLASS}
      />
      Готово
    </div>
  );
}

const nodeTypes: NodeTypes = {
  stage: memo(StageNode),
  trigger: memo(TriggerNode),
  task: memo(TaskNode),
  end: memo(EndNode),
};

function FitViewOnMount({ fitKey }: { fitKey: string }) {
  const { fitView } = useReactFlow();
  const prevKey = useRef<string | null>(null);
  useEffect(() => {
    if (prevKey.current === fitKey) return;
    prevKey.current = fitKey;
    const timer = window.setTimeout(() => {
      void fitView({ padding: 0.12, maxZoom: 0.85, duration: 240 });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [fitKey, fitView]);
  return null;
}

function templatesForStage(
  templates: AutomationTaskTemplate[],
  stageId: string,
  launchPhase?: AutomationLaunchPhase,
) {
  return templates
    .filter((item) => {
      if (item.triggerOptionId !== stageId) return false;
      if (!launchPhase) return true;
      return (item.launchPhase ?? "onEnter") === launchPhase;
    })
    .slice()
    .sort(
      (a, b) => a.stepOrder - b.stepOrder || a.name.localeCompare(b.name, "ru"),
    );
}

/** Trigger / tasks / end that belong to a stage column (move with the header). */
function isStageColumnChild(node: Node, stageId: string): boolean {
  if (node.id === `trigger:${stageId}` || node.id === `end:${stageId}`) {
    return true;
  }
  if (node.type === "task") {
    return (node.data as TaskData).template.triggerOptionId === stageId;
  }
  return false;
}

/** Default Y of the trigger node for a column (after beforeEnter tasks). */
function triggerYForStage(beforeCount: number) {
  return FLOW_Y + beforeCount * (TASK_H + ROW_GAP);
}

const INSERT_PITCH = TASK_H + ROW_GAP;

/**
 * Nearest non-collapsed stage column by header X (freelayout-aware).
 * Falls back to the template's current stage when nothing is closer.
 */
function resolveStageForTaskDrop(input: {
  dropX: number;
  stages: StageOption[];
  nodes: Node[];
  collapsedStageIds: ReadonlySet<string>;
  currentStageId: string;
}): StageOption | null {
  const { dropX, stages, nodes, collapsedStageIds, currentStageId } = input;
  const current =
    stages.find((stage) => stage.id === currentStageId) ?? stages[0] ?? null;
  if (!current) return null;

  let best: StageOption | null = null;
  let bestDist = Infinity;
  for (const stage of stages) {
    if (collapsedStageIds.has(stage.id)) continue;
    const header = nodes.find((node) => node.id === `stage:${stage.id}`);
    if (!header) continue;
    const dist = Math.abs(header.position.x - dropX);
    if (dist < bestDist) {
      bestDist = dist;
      best = stage;
    }
  }
  if (!best) return current;

  const currentHeader = nodes.find((node) => node.id === `stage:${current.id}`);
  if (!currentHeader || best.id === current.id) return best;

  // Require crossing past mid-gap before switching columns.
  const currentDist = Math.abs(currentHeader.position.x - dropX);
  const switchThreshold = (COL_W + COL_GAP) / 2;
  if (bestDist + switchThreshold >= currentDist) return current;
  return best;
}

function resolvePhaseForTaskDrop(
  dropY: number,
  triggerNodeY: number | undefined,
  beforeCountExcludingSelf: number,
): AutomationLaunchPhase {
  const triggerY = triggerNodeY ?? triggerYForStage(beforeCountExcludingSelf);
  // Compare card center to trigger mid — freelayout-safe.
  return dropY + TASK_H / 2 < triggerY + TRIGGER_H / 2
    ? "beforeEnter"
    : "onEnter";
}

function stepOrderAmongSiblings(
  dropY: number,
  siblingIds: string[],
  nodes: Node[],
) {
  const siblingYs = siblingIds
    .map((id) => {
      const node = nodes.find((item) => item.id === id);
      return node ? node.position.y : null;
    })
    .filter((y): y is number => y != null)
    .sort((a, b) => a - b);
  let order = 0;
  for (const y of siblingYs) {
    if (y < dropY - 4) order += 1;
    else break;
  }
  return order;
}

function resolvePosition(
  nodeId: string,
  fallback: { x: number; y: number },
  positions: AutomationCanvasNodePositions,
) {
  const saved = positions[nodeId];
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    return { x: saved.x, y: saved.y };
  }
  return fallback;
}

function buildLayout(input: {
  stages: StageOption[];
  templates: AutomationTaskTemplate[];
  stageTransitions: AutomationStageTransition[];
  stageTaskRelease: AutomationStageTaskReleaseMap;
  activeStageId: string | null;
  selectedTemplateId: string | null;
  selectedTransitionKey: string | null;
  collapsedStageIds: ReadonlySet<string>;
  canvasPositions: AutomationCanvasNodePositions;
  fields: EntityField[];
  onToggleStageCollapse: (stageId: string) => void;
  onSelectTransition: (fromOptionId: string, toOptionId: string) => void;
  onTaskReleaseChange: (
    stageId: string,
    mode: AutomationStageTaskRelease,
  ) => void;
  onAdd: (
    stageId: string,
    launchPhase: AutomationLaunchPhase,
    insertAt: number,
    position?: InsertPosition,
  ) => void;
}): { nodes: Node[]; edges: Edge[] } {
  const {
    stages,
    templates,
    stageTransitions,
    stageTaskRelease,
    activeStageId,
    selectedTemplateId,
    selectedTransitionKey,
    collapsedStageIds,
    canvasPositions,
    fields,
    onToggleStageCollapse,
    onSelectTransition,
    onTaskReleaseChange,
    onAdd,
  } = input;
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const stageIds = new Set(stages.map((stage) => stage.id));
  /** Stages that already have a saved «тогда» — no default next-neighbour link. */
  const stagesWithOutgoing = new Set(
    stageTransitions
      .filter(
        (item) =>
          stageIds.has(item.fromOptionId) && stageIds.has(item.toOptionId),
      )
      .map((item) => item.fromOptionId),
  );

  stages.forEach((stage, index) => {
    const colX = ORIGIN_X + index * (COL_W + COL_GAP);
    const stageNodeId = `stage:${stage.id}`;
    const stageTasks = templatesForStage(templates, stage.id);
    const collapsed = collapsedStageIds.has(stage.id);
    const hasTransitionRule = stagesWithOutgoing.has(stage.id);

    nodes.push({
      id: stageNodeId,
      type: "stage",
      connectable: true,
      deletable: false,
      position: resolvePosition(
        stageNodeId,
        { x: colX, y: STAGE_Y },
        canvasPositions,
      ),
      data: {
        stage,
        taskCount: stageTasks.length,
        active: stage.id === activeStageId,
        collapsed,
        hasTransitionRule,
        onToggleCollapse: () => onToggleStageCollapse(stage.id),
      } satisfies StageData,
    });

    // Placeholder link to the next list option only when nothing is configured yet.
    const nextStage = stages[index + 1];
    if (nextStage && !stagesWithOutgoing.has(stage.id)) {
      const transitionKey = `${stage.id}\0${nextStage.id}`;
      edges.push({
        id: `map-${stage.id}-${nextStage.id}`,
        source: stageNodeId,
        target: `stage:${nextStage.id}`,
        sourceHandle: "then",
        targetHandle: "in",
        type: "stageMap",
        reconnectable: true,
        deletable: true,
        markerEnd: STAGE_MAP_MARKER,
        style: { stroke: "#d4d4d8", strokeWidth: 1.5 },
        data: {
          fromOptionId: stage.id,
          toOptionId: nextStage.id,
          configured: false,
          selected: selectedTransitionKey === transitionKey,
          onOpen: () => onSelectTransition(stage.id, nextStage.id),
        } satisfies StageMapEdgeData,
      });
    }

    const endId = `end:${stage.id}`;

    if (collapsed) {
      // Compact column: only the stage header (no Старт / задачи / Готово).
      return;
    }

    const beforeTasks = templatesForStage(templates, stage.id, "beforeEnter");
    const onEnterTasks = templatesForStage(templates, stage.id, "onEnter");
    const taskRelease = getStageTaskRelease(stageTaskRelease, stage.id);
    const showReleaseToggle = onEnterTasks.length >= 2;
    const triggerHeight = showReleaseToggle
      ? TRIGGER_H_WITH_RELEASE
      : TRIGGER_H;

    let prevId = stageNodeId;
    let y = FLOW_Y;
    const flowStroke = stage.id === activeStageId ? "#f59e0b" : "#cbd5e1";
    const flowWidth = stage.id === activeStageId ? 2 : 1.5;

    const connect = (
      targetId: string,
      phase: AutomationLaunchPhase,
      insertAt: number,
      stroke: string,
      width: number,
      chainHint: AutomationStageTaskRelease | null = null,
    ) => {
      const insert: InsertData = {
        stageId: stage.id,
        launchPhase: phase,
        insertAt,
      };
      edges.push({
        id: `e-${prevId}-${targetId}:${phase}:${insertAt}`,
        source: prevId,
        target: targetId,
        type: "floating",
        reconnectable: false,
        deletable: false,
        style: { stroke, strokeWidth: width },
        data: {
          insert,
          chainHint,
          onAdd: (position) =>
            onAdd(
              insert.stageId,
              insert.launchPhase,
              insert.insertAt,
              position,
            ),
        } satisfies FloatingEdgeData,
      });
      prevId = targetId;
    };

    // Before Start: tasks with mid-edge «+» slots.
    beforeTasks.forEach((template, taskIndex) => {
      nodes.push({
        id: template.id,
        type: "task",
        connectable: false,
        deletable: false,
        position: resolvePosition(template.id, { x: colX, y }, canvasPositions),
        data: {
          template,
          selected: selectedTemplateId === template.id,
          fields,
        },
      });
      connect(template.id, "beforeEnter", taskIndex, "#a1a1aa", 1.5);
      y += TASK_H + ROW_GAP;
    });

    const triggerId = `trigger:${stage.id}`;
    nodes.push({
      id: triggerId,
      type: "trigger",
      connectable: false,
      deletable: false,
      position: resolvePosition(triggerId, { x: colX, y }, canvasPositions),
      data: {
        stageId: stage.id,
        showReleaseToggle,
        taskRelease,
        onTaskReleaseChange: (mode) => onTaskReleaseChange(stage.id, mode),
      } satisfies TriggerData,
    });
    connect(
      triggerId,
      "beforeEnter",
      beforeTasks.length,
      flowStroke,
      flowWidth,
    );
    y += triggerHeight + ROW_GAP;

    // After Start: tasks with mid-edge «+» slots.
    onEnterTasks.forEach((template, taskIndex) => {
      nodes.push({
        id: template.id,
        type: "task",
        connectable: false,
        deletable: false,
        position: resolvePosition(template.id, { x: colX, y }, canvasPositions),
        data: {
          template,
          selected: selectedTemplateId === template.id,
          fields,
        },
      });
      const chainHint = showReleaseToggle && taskIndex > 0 ? taskRelease : null;
      connect(template.id, "onEnter", taskIndex, "#a1a1aa", 1.5, chainHint);
      y += TASK_H + ROW_GAP;
    });

    nodes.push({
      id: endId,
      type: "end",
      connectable: false,
      deletable: false,
      position: resolvePosition(
        endId,
        { x: colX + (COL_W - 140) / 2, y },
        canvasPositions,
      ),
      data: { stageId: stage.id },
    });
    connect(endId, "onEnter", onEnterTasks.length, "#a1a1aa", 1.5);
  });

  // Only the configured «тогда» / «иначе» targets — never a second neighbour link.
  for (const transition of stageTransitions) {
    if (!stageIds.has(transition.fromOptionId)) continue;
    if (!stageIds.has(transition.toOptionId)) continue;
    const transitionKey = `${transition.fromOptionId}\0${transition.toOptionId}`;
    const elseId = transition.elseOptionId.trim();
    const elseStage =
      elseId && stageIds.has(elseId)
        ? stages.find((stage) => stage.id === elseId)
        : null;

    edges.push({
      id: `map-${transition.fromOptionId}-${transition.toOptionId}`,
      source: `stage:${transition.fromOptionId}`,
      target: `stage:${transition.toOptionId}`,
      sourceHandle: "then",
      targetHandle: "in",
      type: "stageMap",
      reconnectable: true,
      deletable: true,
      markerEnd: STAGE_MAP_MARKER,
      style: { stroke: "#94a3b8", strokeWidth: 2 },
      data: {
        fromOptionId: transition.fromOptionId,
        toOptionId: transition.toOptionId,
        configured: true,
        selected: selectedTransitionKey === transitionKey,
        elseLabel: elseStage?.name,
        onOpen: () =>
          onSelectTransition(transition.fromOptionId, transition.toOptionId),
      } satisfies StageMapEdgeData,
    });

    if (!elseStage || elseId === transition.toOptionId) continue;
    edges.push({
      id: `else-${transition.fromOptionId}-${elseId}-${transition.toOptionId}`,
      source: `stage:${transition.fromOptionId}`,
      target: `stage:${elseId}`,
      sourceHandle: "else",
      targetHandle: "in",
      type: "stageElse",
      reconnectable: true,
      deletable: true,
      markerEnd: STAGE_ELSE_MARKER,
      data: {
        fromOptionId: transition.fromOptionId,
        toOptionId: transition.toOptionId,
        selected: selectedTransitionKey === transitionKey,
        onOpen: () =>
          onSelectTransition(transition.fromOptionId, transition.toOptionId),
      } satisfies StageElseEdgeData,
    });
  }

  return { nodes, edges };
}

function FlowInner({
  stages,
  templates,
  stageTransitions,
  stageTaskRelease,
  activeStageId,
  selectedTemplateId,
  selectedTransitionKey,
  canvasPositions,
  collapsedStageIds,
  fields,
  onSelectStage,
  onSelectTemplate,
  onSelectTransition,
  onConnectThen,
  onConnectElse,
  onReconnectThen,
  onReconnectElse,
  onDeleteThen,
  onDeleteElse,
  onTaskReleaseChange,
  onAdd,
  onMoveTemplate,
  onCanvasPositionsChange,
  onToggleStageCollapse,
  fitKey,
}: {
  stages: StageOption[];
  templates: AutomationTaskTemplate[];
  stageTransitions: AutomationStageTransition[];
  stageTaskRelease: AutomationStageTaskReleaseMap;
  activeStageId: string | null;
  selectedTemplateId: string | null;
  selectedTransitionKey: string | null;
  canvasPositions: AutomationCanvasNodePositions;
  collapsedStageIds: ReadonlySet<string>;
  fields: EntityField[];
  onSelectStage: (stageId: string) => void;
  onSelectTemplate: (id: string | null) => void;
  onSelectTransition: (fromOptionId: string, toOptionId: string) => void;
  onConnectThen: (fromOptionId: string, toOptionId: string) => void;
  onConnectElse: (fromOptionId: string, elseOptionId: string) => void;
  onReconnectThen: (
    fromOptionId: string,
    oldToOptionId: string,
    newToOptionId: string,
  ) => void;
  onReconnectElse: (
    fromOptionId: string,
    thenOptionId: string,
    newElseOptionId: string,
  ) => void;
  onDeleteThen: (fromOptionId: string, toOptionId: string) => void;
  onDeleteElse: (fromOptionId: string, toOptionId: string) => void;
  onTaskReleaseChange: (
    stageId: string,
    mode: AutomationStageTaskRelease,
  ) => void;
  onAdd: (
    stageId: string,
    launchPhase: AutomationLaunchPhase,
    insertAt: number,
    position?: InsertPosition,
  ) => void;
  onMoveTemplate: (
    templateId: string,
    stageId: string,
    stepOrder: number,
    launchPhase: AutomationLaunchPhase,
  ) => void;
  onCanvasPositionsChange: (positions: AutomationCanvasNodePositions) => void;
  onToggleStageCollapse: (stageId: string) => void;
  fitKey: string;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const nodesRef = useRef(nodes);
  const collapsedStageIdsRef = useRef(collapsedStageIds);
  const dragStartRef = useRef<{ id: string; x: number; y: number } | null>(
    null,
  );

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  /** When dragging a stage header, child column nodes move by the same delta. */
  const stageGroupDragRef = useRef<{
    stageId: string;
    origin: { x: number; y: number };
    children: Map<string, { x: number; y: number }>;
  } | null>(null);
  const draggingRef = useRef(false);
  const canvasPositionsRef = useRef(canvasPositions);
  /** Local positions applied immediately on drop (before async scenario save). */
  const pendingPositionsRef = useRef<AutomationCanvasNodePositions>({});

  useEffect(() => {
    canvasPositionsRef.current = canvasPositions;
    // Drop pending keys once the saved layout matches them.
    const pending = pendingPositionsRef.current;
    const nextPending: AutomationCanvasNodePositions = {};
    for (const [id, pos] of Object.entries(pending)) {
      const saved = canvasPositions[id];
      if (
        !saved ||
        Math.abs(saved.x - pos.x) > 0.5 ||
        Math.abs(saved.y - pos.y) > 0.5
      ) {
        nextPending[id] = pos;
      }
    }
    pendingPositionsRef.current = nextPending;
  }, [canvasPositions]);

  useEffect(() => {
    if (draggingRef.current) return;

    const mergedPositions: AutomationCanvasNodePositions = {
      ...canvasPositions,
      ...pendingPositionsRef.current,
    };
    const layout = buildLayout({
      stages,
      templates,
      stageTransitions,
      stageTaskRelease,
      activeStageId,
      selectedTemplateId,
      selectedTransitionKey,
      collapsedStageIds,
      canvasPositions: mergedPositions,
      fields,
      onToggleStageCollapse,
      onSelectTransition,
      onTaskReleaseChange,
      onAdd: (stageId, launchPhase, insertAt, position) => {
        onSelectStage(stageId);
        // Open a gap at the «+»: push same-column nodes below the insert.
        if (position) {
          const updates: AutomationCanvasNodePositions = {
            ...canvasPositionsRef.current,
            ...pendingPositionsRef.current,
          };
          for (const node of nodesRef.current) {
            if (
              node.type !== "task" &&
              node.type !== "trigger" &&
              node.type !== "end"
            ) {
              continue;
            }
            if (Math.abs(node.position.x - position.x) > COL_W * 0.65) {
              continue;
            }
            if (node.position.y < position.y - 4) {
              updates[node.id] = {
                x: node.position.x,
                y: node.position.y,
              };
              continue;
            }
            updates[node.id] = {
              x: node.position.x,
              y: node.position.y + INSERT_PITCH,
            };
          }
          pendingPositionsRef.current = {
            ...pendingPositionsRef.current,
            ...updates,
          };
          onCanvasPositionsChange({
            ...canvasPositionsRef.current,
            ...pendingPositionsRef.current,
          });
        }
        onAdd(stageId, launchPhase, insertAt, position);
      },
    });

    const previouslyCollapsed = collapsedStageIdsRef.current;
    setNodes((current) => {
      const livePos = new Map(
        current.map((node) => [node.id, node.position] as const),
      );
      return layout.nodes.map((node) => {
        // Compact / just-expanded «Готово» uses layout Y, not a stale drag pos.
        if (node.type === "end") {
          const stageId = (node.data as { stageId?: string }).stageId;
          if (
            stageId &&
            (collapsedStageIds.has(stageId) || previouslyCollapsed.has(stageId))
          ) {
            return node;
          }
        }
        // Fresh insert / nudge from pending must win over stale live coords.
        if (pendingPositionsRef.current[node.id]) {
          return node;
        }
        const live = livePos.get(node.id);
        // Keep in-canvas positions for existing nodes so selection/data
        // updates do not snap a just-dragged block back.
        if (
          live &&
          (node.type === "task" ||
            node.type === "stage" ||
            node.type === "trigger" ||
            node.type === "end")
        ) {
          return { ...node, position: live };
        }
        return node;
      });
    });
    collapsedStageIdsRef.current = collapsedStageIds;
    setEdges(layout.edges);
  }, [
    fitKey,
    stages,
    templates,
    stageTransitions,
    stageTaskRelease,
    activeStageId,
    selectedTemplateId,
    selectedTransitionKey,
    collapsedStageIds,
    canvasPositions,
    fields,
    onToggleStageCollapse,
    onSelectTransition,
    onTaskReleaseChange,
    onAdd,
    onSelectStage,
    onSelectTemplate,
    onCanvasPositionsChange,
    setNodes,
    setEdges,
  ]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === "stage") {
        onSelectStage(node.id.replace(/^stage:/, ""));
        onSelectTemplate(null);
        return;
      }
      if (node.type === "task") {
        const template = (node.data as TaskData).template;
        onSelectStage(template.triggerOptionId);
        onSelectTemplate(template.id);
      }
    },
    [onSelectStage, onSelectTemplate],
  );

  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      if (edge.type !== "stageMap" && edge.type !== "stageElse") return;
      const data = edge.data as
        StageMapEdgeData | StageElseEdgeData | undefined;
      if (!data?.fromOptionId || !data.toOptionId) return;
      onSelectTransition(data.fromOptionId, data.toOptionId);
    },
    [onSelectTransition],
  );

  const isValidConnection = useCallback<IsValidConnection>((connection) => {
    const from = parseStageNodeId(connection.source);
    const to = parseStageNodeId(connection.target);
    if (!from || !to || from === to) return false;
    // Else handle may only land on a stage target handle.
    if (isElseSourceHandle(connection.sourceHandle)) {
      return connection.targetHandle === "in" || !connection.targetHandle;
    }
    return true;
  }, []);

  const handleConnect = useCallback<OnConnect>(
    (connection: Connection) => {
      const from = parseStageNodeId(connection.source);
      const to = parseStageNodeId(connection.target);
      if (!from || !to || from === to) return;
      if (isElseSourceHandle(connection.sourceHandle)) {
        onConnectElse(from, to);
        return;
      }
      onConnectThen(from, to);
    },
    [onConnectThen, onConnectElse],
  );

  const handleReconnect = useCallback<OnReconnect>(
    (oldEdge, newConnection) => {
      const data = oldEdge.data as
        StageMapEdgeData | StageElseEdgeData | undefined;
      if (!data?.fromOptionId) return;

      const newTarget = parseStageNodeId(newConnection.target);
      if (!newTarget || newTarget === data.fromOptionId) return;

      if (oldEdge.type === "stageElse") {
        if (!data.toOptionId) return;
        onReconnectElse(data.fromOptionId, data.toOptionId, newTarget);
        return;
      }

      if (oldEdge.type === "stageMap") {
        const oldTo = data.toOptionId;
        if (!oldTo || oldTo === newTarget) {
          onSelectTransition(data.fromOptionId, newTarget);
          return;
        }
        onReconnectThen(data.fromOptionId, oldTo, newTarget);
      }
    },
    [onReconnectThen, onReconnectElse, onSelectTransition],
  );

  const handleEdgesDelete = useCallback<OnEdgesDelete>(
    (deleted) => {
      for (const edge of deleted) {
        const data = edge.data as
          StageMapEdgeData | StageElseEdgeData | undefined;
        if (!data?.fromOptionId || !data.toOptionId) continue;
        if (edge.type === "stageElse") {
          onDeleteElse(data.fromOptionId, data.toOptionId);
          continue;
        }
        if (edge.type === "stageMap") {
          // Placeholder neighbour links are not persisted rules.
          const mapData = data as StageMapEdgeData;
          if (mapData.configured === false) continue;
          onDeleteThen(data.fromOptionId, data.toOptionId);
        }
      }
    },
    [onDeleteThen, onDeleteElse],
  );

  const onNodeDragStart: OnNodeDrag = useCallback(
    (_event, node) => {
      draggingRef.current = true;
      dragStartRef.current = {
        id: node.id,
        x: node.position.x,
        y: node.position.y,
      };
      stageGroupDragRef.current = null;
      if (node.type !== "stage") return;

      const stageId = node.id.replace(/^stage:/, "");
      const children = new Map<string, { x: number; y: number }>();
      for (const item of nodes) {
        if (!isStageColumnChild(item, stageId)) continue;
        children.set(item.id, {
          x: item.position.x,
          y: item.position.y,
        });
      }
      stageGroupDragRef.current = {
        stageId,
        origin: { x: node.position.x, y: node.position.y },
        children,
      };
    },
    [nodes],
  );

  const onNodeDrag: OnNodeDrag = useCallback(
    (_event, node) => {
      const group = stageGroupDragRef.current;
      if (!group || node.id !== `stage:${group.stageId}`) return;

      const dx = node.position.x - group.origin.x;
      const dy = node.position.y - group.origin.y;
      if (dx === 0 && dy === 0) return;

      setNodes((current) =>
        current.map((item) => {
          const origin = group.children.get(item.id);
          if (!origin) return item;
          return {
            ...item,
            position: { x: origin.x + dx, y: origin.y + dy },
          };
        }),
      );
    },
    [setNodes],
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, node) => {
      draggingRef.current = false;
      const start = dragStartRef.current;
      const group = stageGroupDragRef.current;
      dragStartRef.current = null;
      stageGroupDragRef.current = null;
      if (!start || start.id !== node.id) return;

      const movedFar =
        Math.hypot(node.position.x - start.x, node.position.y - start.y) > 8;
      if (!movedFar) return;

      if (group && node.type === "stage") {
        const dx = node.position.x - group.origin.x;
        const dy = node.position.y - group.origin.y;
        const updates: AutomationCanvasNodePositions = {
          [node.id]: { x: node.position.x, y: node.position.y },
        };
        for (const [id, origin] of group.children) {
          updates[id] = { x: origin.x + dx, y: origin.y + dy };
        }
        pendingPositionsRef.current = {
          ...pendingPositionsRef.current,
          ...updates,
        };
        onCanvasPositionsChange({
          ...canvasPositionsRef.current,
          ...pendingPositionsRef.current,
        });
        onSelectStage(group.stageId);
        onSelectTemplate(null);
        return;
      }

      const nextPos = { x: node.position.x, y: node.position.y };
      pendingPositionsRef.current = {
        ...pendingPositionsRef.current,
        [node.id]: nextPos,
      };
      onCanvasPositionsChange({
        ...canvasPositionsRef.current,
        ...pendingPositionsRef.current,
        [node.id]: nextPos,
      });

      if (node.type !== "task" || stages.length === 0) return;

      const template = templates.find((item) => item.id === node.id);
      if (!template) return;

      const stage = resolveStageForTaskDrop({
        dropX: node.position.x,
        stages,
        nodes: nodesRef.current,
        collapsedStageIds: collapsedStageIdsRef.current,
        currentStageId: template.triggerOptionId,
      });
      if (!stage) return;

      const beforeOthers = templatesForStage(
        templates,
        stage.id,
        "beforeEnter",
      ).filter((item) => item.id !== node.id);
      const triggerNode = nodesRef.current.find(
        (item) => item.id === `trigger:${stage.id}`,
      );
      const launchPhase = resolvePhaseForTaskDrop(
        node.position.y,
        triggerNode?.position.y,
        beforeOthers.length,
      );
      const phaseSiblings = templatesForStage(templates, stage.id, launchPhase)
        .filter((item) => item.id !== node.id)
        .map((item) => item.id);
      const stepOrder = stepOrderAmongSiblings(
        node.position.y,
        phaseSiblings,
        nodesRef.current,
      );

      const prevPhase = template.launchPhase ?? "onEnter";
      onSelectStage(stage.id);
      onSelectTemplate(node.id);
      if (
        stage.id !== template.triggerOptionId ||
        launchPhase !== prevPhase ||
        stepOrder !== template.stepOrder
      ) {
        onMoveTemplate(node.id, stage.id, stepOrder, launchPhase);
      }
    },
    [
      stages,
      templates,
      onMoveTemplate,
      onSelectStage,
      onSelectTemplate,
      onCanvasPositionsChange,
    ],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      onEdgeClick={onEdgeClick}
      onConnect={handleConnect}
      onReconnect={handleReconnect}
      onEdgesDelete={handleEdgesDelete}
      isValidConnection={isValidConnection}
      onNodeDragStart={onNodeDragStart}
      onNodeDrag={onNodeDrag}
      onNodeDragStop={onNodeDragStop}
      onPaneClick={() => {
        onSelectTemplate(null);
        onSelectStage("");
      }}
      nodesDraggable
      nodesConnectable
      edgesReconnectable
      connectionMode={ConnectionMode.Loose}
      elementsSelectable
      selectNodesOnDrag={false}
      nodeDragThreshold={4}
      edgesFocusable
      deleteKeyCode={["Backspace", "Delete"]}
      minZoom={0.15}
      maxZoom={1.25}
      proOptions={{ hideAttribution: true }}
      className="bg-muted/20"
      defaultEdgeOptions={{
        interactionWidth: 24,
      }}
    >
      <FitViewOnMount fitKey={fitKey} />
      <Background
        variant={BackgroundVariant.Dots}
        gap={18}
        size={1.1}
        color="var(--border)"
      />
      <Controls showInteractive={false} position="bottom-left" />
      <MiniMap
        pannable
        zoomable
        position="bottom-right"
        className="!overflow-hidden !rounded-lg !border !border-border !bg-card"
        style={{ width: 160, height: 100 }}
        nodeColor={(node) =>
          node.type === "stage"
            ? "#64748b"
            : node.type === "trigger"
              ? "#f59e0b"
              : node.type === "end"
                ? "#10b981"
                : "#94a3b8"
        }
      />
    </ReactFlow>
  );
}

export function AutomationFlowCanvas({
  stages,
  templates,
  stageTransitions,
  stageTaskRelease,
  activeStageId,
  selectedTemplateId,
  selectedTransitionKey,
  canvasPositions,
  collapsedStageIds,
  fields,
  onSelectStage,
  onSelectTemplate,
  onSelectTransition,
  onConnectThen,
  onConnectElse,
  onReconnectThen,
  onReconnectElse,
  onDeleteThen,
  onDeleteElse,
  onTaskReleaseChange,
  onAdd,
  onMoveTemplate,
  onCanvasPositionsChange,
  onToggleStageCollapse,
}: {
  stages: StageOption[];
  templates: AutomationTaskTemplate[];
  stageTransitions: AutomationStageTransition[];
  stageTaskRelease: AutomationStageTaskReleaseMap;
  activeStageId: string | null;
  selectedTemplateId: string | null;
  selectedTransitionKey: string | null;
  canvasPositions: AutomationCanvasNodePositions;
  collapsedStageIds: ReadonlySet<string>;
  fields: EntityField[];
  onSelectStage: (stageId: string) => void;
  onSelectTemplate: (id: string | null) => void;
  onSelectTransition: (fromOptionId: string, toOptionId: string) => void;
  onConnectThen: (fromOptionId: string, toOptionId: string) => void;
  onConnectElse: (fromOptionId: string, elseOptionId: string) => void;
  onReconnectThen: (
    fromOptionId: string,
    oldToOptionId: string,
    newToOptionId: string,
  ) => void;
  onReconnectElse: (
    fromOptionId: string,
    thenOptionId: string,
    newElseOptionId: string,
  ) => void;
  onDeleteThen: (fromOptionId: string, toOptionId: string) => void;
  onDeleteElse: (fromOptionId: string, toOptionId: string) => void;
  onTaskReleaseChange: (
    stageId: string,
    mode: AutomationStageTaskRelease,
  ) => void;
  onAdd: (
    stageId: string,
    launchPhase: AutomationLaunchPhase,
    insertAt: number,
    position?: InsertPosition,
  ) => void;
  onMoveTemplate: (
    templateId: string,
    stageId: string,
    stepOrder: number,
    launchPhase: AutomationLaunchPhase,
  ) => void;
  onCanvasPositionsChange: (positions: AutomationCanvasNodePositions) => void;
  onToggleStageCollapse: (stageId: string) => void;
}) {
  // Structural fit only — ignore rename/reorder so drag does not re-fit.
  const fitKey = [
    stages.map((s) => s.id).join(","),
    templates.map((t) => t.id).join(","),
    stageTransitions
      .map((t) => `${t.fromOptionId}:${t.toOptionId}:${t.elseOptionId}`)
      .join(","),
    Object.entries(stageTaskRelease)
      .map(([id, mode]) => `${id}:${mode}`)
      .sort()
      .join(","),
  ].join("|");

  return (
    <ReactFlowProvider>
      <div className="relative h-full min-h-[420px] w-full">
        <FlowInner
          stages={stages}
          templates={templates}
          stageTransitions={stageTransitions}
          stageTaskRelease={stageTaskRelease}
          activeStageId={activeStageId}
          selectedTemplateId={selectedTemplateId}
          selectedTransitionKey={selectedTransitionKey}
          canvasPositions={canvasPositions}
          collapsedStageIds={collapsedStageIds}
          fields={fields}
          onSelectStage={onSelectStage}
          onSelectTemplate={onSelectTemplate}
          onSelectTransition={onSelectTransition}
          onConnectThen={onConnectThen}
          onConnectElse={onConnectElse}
          onReconnectThen={onReconnectThen}
          onReconnectElse={onReconnectElse}
          onDeleteThen={onDeleteThen}
          onDeleteElse={onDeleteElse}
          onTaskReleaseChange={onTaskReleaseChange}
          onAdd={onAdd}
          onMoveTemplate={onMoveTemplate}
          onCanvasPositionsChange={onCanvasPositionsChange}
          onToggleStageCollapse={onToggleStageCollapse}
          fitKey={fitKey}
        />
      </div>
    </ReactFlowProvider>
  );
}
