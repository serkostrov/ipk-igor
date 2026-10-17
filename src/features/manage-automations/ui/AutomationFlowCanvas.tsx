import { useEffect, useCallback, memo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getSmoothStepPath,
  useEdgesState,
  useInternalNode,
  useNodesState,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type InternalNode,
  type Node,
  type NodeProps,
  type NodeTypes,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Flag, GitBranch, Lock, Plus, Timer, User, Zap } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type {
  AutomationCanvasLayout,
  AutomationLaunchPhase,
  AutomationStageTransition,
  AutomationTaskTemplate,
} from "@/entities/automation";
import {
  AUTOMATION_ASSIGNEE_TYPE_LABELS,
  stageTransitionIsConfigured,
} from "@/entities/automation";
import type { EntityField } from "@/entities/entity";
import { TemplateRichText } from "./TemplateRichText";

const COL_W = 220;
const COL_GAP = 36;
const ORIGIN_X = 32;
const STAGE_Y = 28;
const FLOW_Y = 130;
const ROW_GAP = 16;
const TASK_H = 92;
const TRIGGER_H = 72;
const INSERT_H = 28;

const HANDLE_CLASS =
  "!size-2 !border-2 !border-background !bg-muted-foreground/35 !opacity-0";

function nodeCenter(node: InternalNode) {
  const { width = COL_W, height = TASK_H } = node.measured ?? {};
  const { x, y } = node.internals.positionAbsolute;
  return { x: x + width / 2, y: y + height / 2 };
}

/** Intersection of center→center line with the node's border rectangle. */
function getNodeIntersection(
  intersectionNode: InternalNode,
  targetNode: InternalNode,
) {
  const { width = COL_W, height = TASK_H } = intersectionNode.measured ?? {};
  const intersectionNodePosition = intersectionNode.internals.positionAbsolute;
  const targetCenter = nodeCenter(targetNode);

  const w = width / 2;
  const h = height / 2;
  const x2 = intersectionNodePosition.x + w;
  const y2 = intersectionNodePosition.y + h;
  const x1 = targetCenter.x;
  const y1 = targetCenter.y;

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;

  return {
    x: w * (xx3 + yy3) + x2,
    y: h * (-xx3 + yy3) + y2,
  };
}

function getEdgeSide(
  node: InternalNode,
  intersectionPoint: { x: number; y: number },
): Position {
  const { width = COL_W, height = TASK_H } = node.measured ?? {};
  const { x, y } = node.internals.positionAbsolute;
  const px = Math.round(intersectionPoint.x);
  const py = Math.round(intersectionPoint.y);
  const nx = Math.round(x);
  const ny = Math.round(y);

  if (px <= nx + 1) return Position.Left;
  if (px >= nx + width - 1) return Position.Right;
  if (py <= ny + 1) return Position.Top;
  if (py >= ny + height - 1) return Position.Bottom;
  return Position.Top;
}

function getFloatingEdgeParams(source: InternalNode, target: InternalNode) {
  const sourcePoint = getNodeIntersection(source, target);
  const targetPoint = getNodeIntersection(target, source);
  return {
    sx: sourcePoint.x,
    sy: sourcePoint.y,
    tx: targetPoint.x,
    ty: targetPoint.y,
    sourcePos: getEdgeSide(source, sourcePoint),
    targetPos: getEdgeSide(target, targetPoint),
  };
}

function FloatingEdge({ id, source, target, style, markerEnd }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty, sourcePos, targetPos } = getFloatingEdgeParams(
    sourceNode,
    targetNode,
  );
  const [edgePath] = getSmoothStepPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
    borderRadius: 12,
  });

  return (
    <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
  );
}

type StageMapEdgeData = {
  fromOptionId: string;
  toOptionId: string;
  configured: boolean;
  selected: boolean;
  /** Optional «иначе» target stage name for the mid badge. */
  elseLabel?: string;
  onOpen?: () => void;
};

type StageElseEdgeData = {
  fromOptionId: string;
  toOptionId: string;
  selected: boolean;
  onOpen?: () => void;
};

/** Horizontal map link between stage columns — mid-edge «+» / branch control. */
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

  const { sx, sy, tx, ty, sourcePos, targetPos } = getFloatingEdgeParams(
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
    borderRadius: 12,
  });

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
              ? "#94a3b8"
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
              <Plus className="size-3.5" aria-hidden />
            )}
          </button>
          {configured ? (
            <span
              className={cn(
                "rounded-md border bg-card px-1.5 py-0.5 text-[9px] font-medium tracking-wide uppercase shadow-xs",
                selected
                  ? "border-primary/40 text-primary"
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

/** Redirect edge when conditions fail («иначе» → другой stage). */
function StageElseEdge({ id, source, target, markerEnd, data }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const edgeData = (data ?? {}) as StageElseEdgeData;

  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty, sourcePos, targetPos } = getFloatingEdgeParams(
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
    borderRadius: 16,
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
            title="Ветка «иначе» — открыть условие перехода"
            aria-label="Ветка иначе"
            className={cn(
              "rounded-md border bg-card px-2 py-0.5 text-[9px] font-semibold tracking-wide uppercase shadow-sm transition-all",
              "hover:border-amber-500/50 hover:text-amber-700",
              selected
                ? "border-amber-500 text-amber-700 ring-2 ring-amber-500/20"
                : "border-amber-500/35 text-amber-700/90",
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
};
type TaskData = {
  template: AutomationTaskTemplate;
  selected: boolean;
  fields: EntityField[];
};
type InsertData = {
  stageId: string;
  launchPhase: AutomationLaunchPhase;
  insertAt: number;
};

function StageNode({ data }: NodeProps<Node<StageData, "stage">>) {
  return (
    <div
      className={cn(
        "relative flex h-[56px] w-[220px] cursor-grab flex-col justify-center rounded-xl border bg-card px-3 shadow-sm active:cursor-grabbing",
        data.active ? "border-primary ring-2 ring-primary/20" : "border-border",
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
      <div className="flex items-center gap-2">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: data.stage.color || "var(--primary)" }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{data.stage.name}</p>
          <p className="text-[10px] text-muted-foreground">
            {data.taskCount === 0
              ? "Нет задач"
              : data.taskCount === 1
                ? "1 задача"
                : `${data.taskCount} задач`}
          </p>
        </div>
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

function TriggerNode() {
  return (
    <div className="flex h-[72px] w-[220px] cursor-grab items-center gap-2.5 rounded-xl border border-amber-500/30 bg-card px-3 shadow-sm active:cursor-grabbing">
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
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600">
        <Zap className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold">Старт</p>
        <p className="truncate text-[10px] text-muted-foreground">
          Попадание на стадию
        </p>
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

function InsertNode({ data }: NodeProps<Node<InsertData, "insert">>) {
  const label =
    data.launchPhase === "beforeEnter"
      ? "Добавить задачу до старта"
      : "Добавить задачу";
  return (
    <button
      type="button"
      className="nodrag nopan group relative flex h-7 w-[220px] items-center justify-center"
      data-stage-add={data.stageId}
      data-launch-phase={data.launchPhase}
      data-insert-at={data.insertAt}
      aria-label={label}
      title={label}
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
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-12 top-1/2 h-px -translate-y-1/2 bg-border/80 transition-colors group-hover:bg-primary/35"
      />
      <span className="relative z-10 flex size-6 items-center justify-center rounded-full border border-border/90 bg-card text-muted-foreground shadow-sm transition-all group-hover:scale-110 group-hover:border-primary/50 group-hover:bg-primary/[0.06] group-hover:text-primary">
        <Plus className="size-3.5" strokeWidth={2.25} />
      </span>
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
    </button>
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
  insert: memo(InsertNode),
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

function columnIndexFromX(x: number, stageCount: number) {
  const index = Math.round((x - ORIGIN_X) / (COL_W + COL_GAP));
  return Math.max(0, Math.min(stageCount - 1, index));
}

/** Default Y of the trigger node for a column (after beforeEnter block). */
function triggerYForStage(beforeCount: number) {
  const slots = beforeCount + 1; // insert before each + trailing insert
  return (
    FLOW_Y + slots * (INSERT_H + ROW_GAP) + beforeCount * (TASK_H + ROW_GAP)
  );
}

function phaseFromY(y: number, beforeCount: number): AutomationLaunchPhase {
  const triggerY = triggerYForStage(beforeCount);
  return y < triggerY + TRIGGER_H / 2 ? "beforeEnter" : "onEnter";
}

function stepOrderFromY(
  y: number,
  phase: AutomationLaunchPhase,
  beforeCount: number,
) {
  if (phase === "beforeEnter") {
    const start = FLOW_Y + INSERT_H + ROW_GAP;
    if (y <= start) return 0;
    return Math.max(0, Math.round((y - start) / (TASK_H + INSERT_H + ROW_GAP)));
  }
  const start =
    triggerYForStage(beforeCount) + TRIGGER_H + ROW_GAP + INSERT_H + ROW_GAP;
  if (y <= start) return 0;
  return Math.max(0, Math.round((y - start) / (TASK_H + INSERT_H + ROW_GAP)));
}

function resolvePosition(
  nodeId: string,
  fallback: { x: number; y: number },
  layout: AutomationCanvasLayout,
) {
  const saved = layout[nodeId];
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    return { x: saved.x, y: saved.y };
  }
  return fallback;
}

function buildLayout(input: {
  stages: StageOption[];
  templates: AutomationTaskTemplate[];
  stageTransitions: AutomationStageTransition[];
  activeStageId: string | null;
  selectedTemplateId: string | null;
  selectedTransitionKey: string | null;
  canvasLayout: AutomationCanvasLayout;
  fields: EntityField[];
  onSelectTransition: (fromOptionId: string, toOptionId: string) => void;
}): { nodes: Node[]; edges: Edge[] } {
  const {
    stages,
    templates,
    stageTransitions,
    activeStageId,
    selectedTemplateId,
    selectedTransitionKey,
    canvasLayout,
    fields,
    onSelectTransition,
  } = input;
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  stages.forEach((stage, index) => {
    const colX = ORIGIN_X + index * (COL_W + COL_GAP);
    const stageNodeId = `stage:${stage.id}`;
    const stageTasks = templatesForStage(templates, stage.id);

    nodes.push({
      id: stageNodeId,
      type: "stage",
      position: resolvePosition(
        stageNodeId,
        { x: colX, y: STAGE_Y },
        canvasLayout,
      ),
      data: {
        stage,
        taskCount: stageTasks.length,
        active: stage.id === activeStageId,
      },
    });

    if (index > 0) {
      const prev = stages[index - 1]!;
      const transition = stageTransitions.find(
        (item) => item.fromOptionId === prev.id && item.toOptionId === stage.id,
      );
      const transitionKey = `${prev.id}\0${stage.id}`;
      const elseStage = transition?.elseOptionId
        ? stages.find((item) => item.id === transition.elseOptionId)
        : null;
      edges.push({
        id: `map-${prev.id}-${stage.id}`,
        source: `stage:${prev.id}`,
        target: stageNodeId,
        type: "stageMap",
        style: { stroke: "#d4d4d8", strokeWidth: 1.5 },
        data: {
          fromOptionId: prev.id,
          toOptionId: stage.id,
          configured: stageTransitionIsConfigured(transition),
          selected: selectedTransitionKey === transitionKey,
          elseLabel: elseStage?.name,
          onOpen: () => onSelectTransition(prev.id, stage.id),
        } satisfies StageMapEdgeData,
      });
    }

    const beforeTasks = templatesForStage(templates, stage.id, "beforeEnter");
    const onEnterTasks = templatesForStage(templates, stage.id, "onEnter");

    let prevId = stageNodeId;
    let y = FLOW_Y;
    const flowStroke = stage.id === activeStageId ? "#f59e0b" : "#cbd5e1";
    const flowWidth = stage.id === activeStageId ? 2 : 1.5;

    const pushInsert = (phase: AutomationLaunchPhase, insertAt: number) => {
      const insertId = `insert:${stage.id}:${phase}:${insertAt}`;
      nodes.push({
        id: insertId,
        type: "insert",
        position: { x: colX, y },
        data: {
          stageId: stage.id,
          launchPhase: phase,
          insertAt,
        } satisfies InsertData,
        draggable: false,
      });
      edges.push({
        id: `e-${prevId}-${insertId}`,
        source: prevId,
        target: insertId,
        type: "floating",
        style: { stroke: flowStroke, strokeWidth: flowWidth },
      });
      prevId = insertId;
      y += INSERT_H + ROW_GAP;
    };

    const pushTask = (template: AutomationTaskTemplate) => {
      nodes.push({
        id: template.id,
        type: "task",
        position: resolvePosition(template.id, { x: colX, y }, canvasLayout),
        data: {
          template,
          selected: selectedTemplateId === template.id,
          fields,
        },
      });
      edges.push({
        id: `e-${prevId}-${template.id}`,
        source: prevId,
        target: template.id,
        type: "floating",
        style: { stroke: "#a1a1aa", strokeWidth: 1.5 },
      });
      prevId = template.id;
      y += TASK_H + ROW_GAP;
    };

    // Before Start: insert + tasks (prep before list change).
    pushInsert("beforeEnter", 0);
    beforeTasks.forEach((template, index) => {
      pushTask(template);
      pushInsert("beforeEnter", index + 1);
    });

    const triggerId = `trigger:${stage.id}`;
    nodes.push({
      id: triggerId,
      type: "trigger",
      position: resolvePosition(triggerId, { x: colX, y }, canvasLayout),
      data: { stageId: stage.id },
    });
    edges.push({
      id: `down-${stage.id}`,
      source: prevId,
      target: triggerId,
      type: "floating",
      style: { stroke: flowStroke, strokeWidth: flowWidth },
    });
    prevId = triggerId;
    y += TRIGGER_H + ROW_GAP;

    // After Start: insert + tasks.
    pushInsert("onEnter", 0);
    onEnterTasks.forEach((template, index) => {
      pushTask(template);
      pushInsert("onEnter", index + 1);
    });

    const endId = `end:${stage.id}`;
    nodes.push({
      id: endId,
      type: "end",
      position: resolvePosition(
        endId,
        { x: colX + (COL_W - 140) / 2, y },
        canvasLayout,
      ),
      data: { stageId: stage.id },
    });
    edges.push({
      id: `e-${prevId}-${endId}`,
      source: prevId,
      target: endId,
      type: "floating",
      style: { stroke: "#a1a1aa", strokeWidth: 1.5 },
    });
  });

  // «Иначе» redirects: line from source stage to the configured else stage.
  for (const transition of stageTransitions) {
    if (!stageTransitionIsConfigured(transition)) continue;
    const elseId = transition.elseOptionId.trim();
    if (!elseId) continue;
    if (!stages.some((stage) => stage.id === transition.fromOptionId)) continue;
    if (!stages.some((stage) => stage.id === elseId)) continue;
    // Skip if else is already the next consecutive stage (same as «тогда»).
    if (elseId === transition.toOptionId) continue;

    const transitionKey = `${transition.fromOptionId}\0${transition.toOptionId}`;
    edges.push({
      id: `else-${transition.fromOptionId}-${elseId}-${transition.toOptionId}`,
      source: `stage:${transition.fromOptionId}`,
      target: `stage:${elseId}`,
      type: "stageElse",
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
  activeStageId,
  selectedTemplateId,
  selectedTransitionKey,
  canvasLayout,
  fields,
  onSelectStage,
  onSelectTemplate,
  onSelectTransition,
  onAdd,
  onMoveTemplate,
  onCanvasLayoutChange,
  fitKey,
}: {
  stages: StageOption[];
  templates: AutomationTaskTemplate[];
  stageTransitions: AutomationStageTransition[];
  activeStageId: string | null;
  selectedTemplateId: string | null;
  selectedTransitionKey: string | null;
  canvasLayout: AutomationCanvasLayout;
  fields: EntityField[];
  onSelectStage: (stageId: string) => void;
  onSelectTemplate: (id: string | null) => void;
  onSelectTransition: (fromOptionId: string, toOptionId: string) => void;
  onAdd: (
    stageId: string,
    launchPhase: AutomationLaunchPhase,
    insertAt: number,
  ) => void;
  onMoveTemplate: (
    templateId: string,
    stageId: string,
    stepOrder: number,
    launchPhase: AutomationLaunchPhase,
  ) => void;
  onCanvasLayoutChange: (layout: AutomationCanvasLayout) => void;
  fitKey: string;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const dragStartRef = useRef<{ id: string; x: number; y: number } | null>(
    null,
  );
  const draggingRef = useRef(false);
  const canvasLayoutRef = useRef(canvasLayout);
  /** Local positions applied immediately on drop (before async scenario save). */
  const pendingLayoutRef = useRef<AutomationCanvasLayout>({});

  useEffect(() => {
    canvasLayoutRef.current = canvasLayout;
    // Drop pending keys once the saved layout matches them.
    const pending = pendingLayoutRef.current;
    const nextPending: AutomationCanvasLayout = {};
    for (const [id, pos] of Object.entries(pending)) {
      const saved = canvasLayout[id];
      if (
        !saved ||
        Math.abs(saved.x - pos.x) > 0.5 ||
        Math.abs(saved.y - pos.y) > 0.5
      ) {
        nextPending[id] = pos;
      }
    }
    pendingLayoutRef.current = nextPending;
  }, [canvasLayout]);

  useEffect(() => {
    if (draggingRef.current) return;

    const mergedLayout: AutomationCanvasLayout = {
      ...canvasLayout,
      ...pendingLayoutRef.current,
    };
    const layout = buildLayout({
      stages,
      templates,
      stageTransitions,
      activeStageId,
      selectedTemplateId,
      selectedTransitionKey,
      canvasLayout: mergedLayout,
      fields,
      onSelectTransition,
    });

    setNodes((current) => {
      const livePos = new Map(
        current.map((node) => [node.id, node.position] as const),
      );
      return layout.nodes.map((node) => {
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
    setEdges(layout.edges);
  }, [
    fitKey,
    stages,
    templates,
    stageTransitions,
    activeStageId,
    selectedTemplateId,
    selectedTransitionKey,
    canvasLayout,
    fields,
    onSelectTransition,
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
        return;
      }
      if (node.type === "insert") {
        const data = node.data as InsertData;
        onSelectStage(data.stageId);
        onSelectTemplate(null);
        onAdd(data.stageId, data.launchPhase, data.insertAt);
      }
    },
    [onSelectStage, onSelectTemplate, onAdd],
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

  const onNodeDragStart: OnNodeDrag = useCallback((_event, node) => {
    draggingRef.current = true;
    dragStartRef.current = {
      id: node.id,
      x: node.position.x,
      y: node.position.y,
    };
  }, []);

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, node) => {
      draggingRef.current = false;
      const start = dragStartRef.current;
      dragStartRef.current = null;
      if (!start || start.id !== node.id) return;
      if (node.type === "insert") return;

      const movedFar =
        Math.hypot(node.position.x - start.x, node.position.y - start.y) > 8;
      if (!movedFar) return;

      const nextPos = { x: node.position.x, y: node.position.y };
      pendingLayoutRef.current = {
        ...pendingLayoutRef.current,
        [node.id]: nextPos,
      };
      onCanvasLayoutChange({
        ...canvasLayoutRef.current,
        ...pendingLayoutRef.current,
        [node.id]: nextPos,
      });

      if (node.type !== "task" || stages.length === 0) return;

      const colIndex = columnIndexFromX(node.position.x, stages.length);
      const stage = stages[colIndex];
      if (!stage) return;
      const beforeCount = templatesForStage(
        templates,
        stage.id,
        "beforeEnter",
      ).length;
      const launchPhase = phaseFromY(node.position.y, beforeCount);
      const stepOrder = stepOrderFromY(
        node.position.y,
        launchPhase,
        beforeCount,
      );
      onSelectStage(stage.id);
      onSelectTemplate(node.id);
      onMoveTemplate(node.id, stage.id, stepOrder, launchPhase);
    },
    [
      stages,
      templates,
      onMoveTemplate,
      onSelectStage,
      onSelectTemplate,
      onCanvasLayoutChange,
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
      onNodeDragStart={onNodeDragStart}
      onNodeDragStop={onNodeDragStop}
      onPaneClick={() => {
        onSelectTemplate(null);
        onSelectTransition("", "");
      }}
      nodesDraggable
      nodesConnectable={false}
      elementsSelectable
      selectNodesOnDrag={false}
      nodeDragThreshold={4}
      edgesFocusable
      deleteKeyCode={null}
      minZoom={0.15}
      maxZoom={1.25}
      proOptions={{ hideAttribution: true }}
      className="bg-muted/20"
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
                : node.type === "insert"
                  ? "#e4e4e7"
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
  activeStageId,
  selectedTemplateId,
  selectedTransitionKey,
  canvasLayout,
  fields,
  onSelectStage,
  onSelectTemplate,
  onSelectTransition,
  onAdd,
  onMoveTemplate,
  onCanvasLayoutChange,
}: {
  stages: StageOption[];
  templates: AutomationTaskTemplate[];
  stageTransitions: AutomationStageTransition[];
  activeStageId: string | null;
  selectedTemplateId: string | null;
  selectedTransitionKey: string | null;
  canvasLayout: AutomationCanvasLayout;
  fields: EntityField[];
  onSelectStage: (stageId: string) => void;
  onSelectTemplate: (id: string | null) => void;
  onSelectTransition: (fromOptionId: string, toOptionId: string) => void;
  onAdd: (
    stageId: string,
    launchPhase: AutomationLaunchPhase,
    insertAt: number,
  ) => void;
  onMoveTemplate: (
    templateId: string,
    stageId: string,
    stepOrder: number,
    launchPhase: AutomationLaunchPhase,
  ) => void;
  onCanvasLayoutChange: (layout: AutomationCanvasLayout) => void;
}) {
  // Structural fit only — ignore rename/reorder so drag does not re-fit.
  const fitKey = [
    stages.map((s) => s.id).join(","),
    templates.map((t) => t.id).join(","),
    stageTransitions.map((t) => `${t.fromOptionId}:${t.toOptionId}`).join(","),
  ].join("|");

  return (
    <ReactFlowProvider>
      <div className="relative h-full min-h-[420px] w-full">
        <FlowInner
          stages={stages}
          templates={templates}
          stageTransitions={stageTransitions}
          activeStageId={activeStageId}
          selectedTemplateId={selectedTemplateId}
          selectedTransitionKey={selectedTransitionKey}
          canvasLayout={canvasLayout}
          fields={fields}
          onSelectStage={onSelectStage}
          onSelectTemplate={onSelectTemplate}
          onSelectTransition={onSelectTransition}
          onAdd={onAdd}
          onMoveTemplate={onMoveTemplate}
          onCanvasLayoutChange={onCanvasLayoutChange}
          fitKey={fitKey}
        />
      </div>
    </ReactFlowProvider>
  );
}
