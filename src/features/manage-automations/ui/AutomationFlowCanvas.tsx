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
  getStraightPath,
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
import {
  Eye,
  EyeOff,
  Flag,
  GitBranch,
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
const ROW_GAP = 40;
const TASK_H = 92;
const TRIGGER_H = 72;

const HANDLE_CLASS =
  "!size-2 !border-2 !border-background !bg-muted-foreground/35 !opacity-0";

type InsertData = {
  stageId: string;
  launchPhase: AutomationLaunchPhase;
  insertAt: number;
};

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

type FloatingEdgeData = {
  insert?: InsertData;
  onAdd?: () => void;
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
  const addLabel =
    insert?.launchPhase === "beforeEnter"
      ? "Добавить задачу до старта"
      : "Добавить задачу";

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {insert ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan group pointer-events-auto absolute z-20"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            <div className="relative flex min-h-6 min-w-6 items-center justify-center">
              <button
                type="button"
                title={addLabel}
                aria-label={addLabel}
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border border-border/90 bg-card text-muted-foreground shadow-sm transition-all",
                  "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                  "hover:scale-110 hover:border-primary/50 hover:bg-primary/[0.06] hover:text-primary",
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  edgeData.onAdd?.();
                }}
              >
                <Plus className="size-3.5" strokeWidth={2.25} aria-hidden />
              </button>
            </div>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const edgeTypes: EdgeTypes = {
  floating: memo(FloatingEdge),
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
        "relative flex h-[56px] w-[220px] cursor-grab flex-col justify-center rounded-xl border bg-card px-3 pr-9 shadow-sm active:cursor-grabbing",
        data.active ? "border-primary ring-2 ring-primary/20" : "border-border",
        data.collapsed && "border-dashed bg-muted/30",
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

function columnIndexFromX(x: number, stageCount: number) {
  const index = Math.round((x - ORIGIN_X) / (COL_W + COL_GAP));
  return Math.max(0, Math.min(stageCount - 1, index));
}

/** Default Y of the trigger node for a column (after beforeEnter tasks). */
function triggerYForStage(beforeCount: number) {
  return FLOW_Y + beforeCount * (TASK_H + ROW_GAP);
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
    if (y <= FLOW_Y) return 0;
    return Math.max(0, Math.round((y - FLOW_Y) / (TASK_H + ROW_GAP)));
  }
  const start = triggerYForStage(beforeCount) + TRIGGER_H + ROW_GAP;
  if (y <= start) return 0;
  return Math.max(0, Math.round((y - start) / (TASK_H + ROW_GAP)));
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
  activeStageId: string | null;
  selectedTemplateId: string | null;
  collapsedStageIds: ReadonlySet<string>;
  canvasPositions: AutomationCanvasNodePositions;
  fields: EntityField[];
  onToggleStageCollapse: (stageId: string) => void;
  onAdd: (
    stageId: string,
    launchPhase: AutomationLaunchPhase,
    insertAt: number,
  ) => void;
}): { nodes: Node[]; edges: Edge[] } {
  const {
    stages,
    templates,
    stageTransitions,
    activeStageId,
    selectedTemplateId,
    collapsedStageIds,
    canvasPositions,
    fields,
    onToggleStageCollapse,
    onAdd,
  } = input;
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  stages.forEach((stage, index) => {
    const colX = ORIGIN_X + index * (COL_W + COL_GAP);
    const stageNodeId = `stage:${stage.id}`;
    const stageTasks = templatesForStage(templates, stage.id);
    const collapsed = collapsedStageIds.has(stage.id);
    const nextStage = stages[index + 1];
    const hasTransitionRule = nextStage
      ? stageTransitionIsConfigured(
          stageTransitions.find(
            (item) =>
              item.fromOptionId === stage.id &&
              item.toOptionId === nextStage.id,
          ),
        )
      : false;

    nodes.push({
      id: stageNodeId,
      type: "stage",
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

    const endId = `end:${stage.id}`;

    if (collapsed) {
      // Compact column: only the stage header (no Старт / задачи / Готово).
      return;
    }

    const beforeTasks = templatesForStage(templates, stage.id, "beforeEnter");
    const onEnterTasks = templatesForStage(templates, stage.id, "onEnter");

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
        style: { stroke, strokeWidth: width },
        data: {
          insert,
          onAdd: () =>
            onAdd(insert.stageId, insert.launchPhase, insert.insertAt),
        } satisfies FloatingEdgeData,
      });
      prevId = targetId;
    };

    // Before Start: tasks with mid-edge «+» slots.
    beforeTasks.forEach((template, taskIndex) => {
      nodes.push({
        id: template.id,
        type: "task",
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
      position: resolvePosition(triggerId, { x: colX, y }, canvasPositions),
      data: { stageId: stage.id },
    });
    connect(
      triggerId,
      "beforeEnter",
      beforeTasks.length,
      flowStroke,
      flowWidth,
    );
    y += TRIGGER_H + ROW_GAP;

    // After Start: tasks with mid-edge «+» slots.
    onEnterTasks.forEach((template, taskIndex) => {
      nodes.push({
        id: template.id,
        type: "task",
        position: resolvePosition(template.id, { x: colX, y }, canvasPositions),
        data: {
          template,
          selected: selectedTemplateId === template.id,
          fields,
        },
      });
      connect(template.id, "onEnter", taskIndex, "#a1a1aa", 1.5);
      y += TASK_H + ROW_GAP;
    });

    nodes.push({
      id: endId,
      type: "end",
      position: resolvePosition(
        endId,
        { x: colX + (COL_W - 140) / 2, y },
        canvasPositions,
      ),
      data: { stageId: stage.id },
    });
    connect(endId, "onEnter", onEnterTasks.length, "#a1a1aa", 1.5);
  });

  return { nodes, edges };
}

function FlowInner({
  stages,
  templates,
  stageTransitions,
  activeStageId,
  selectedTemplateId,
  canvasPositions,
  collapsedStageIds,
  fields,
  onSelectStage,
  onSelectTemplate,
  onAdd,
  onMoveTemplate,
  onCanvasPositionsChange,
  onToggleStageCollapse,
  fitKey,
}: {
  stages: StageOption[];
  templates: AutomationTaskTemplate[];
  stageTransitions: AutomationStageTransition[];
  activeStageId: string | null;
  selectedTemplateId: string | null;
  canvasPositions: AutomationCanvasNodePositions;
  collapsedStageIds: ReadonlySet<string>;
  fields: EntityField[];
  onSelectStage: (stageId: string) => void;
  onSelectTemplate: (id: string | null) => void;
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
  onCanvasPositionsChange: (positions: AutomationCanvasNodePositions) => void;
  onToggleStageCollapse: (stageId: string) => void;
  fitKey: string;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const collapsedStageIdsRef = useRef(collapsedStageIds);
  const dragStartRef = useRef<{ id: string; x: number; y: number } | null>(
    null,
  );
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
      activeStageId,
      selectedTemplateId,
      collapsedStageIds,
      canvasPositions: mergedPositions,
      fields,
      onToggleStageCollapse,
      onAdd: (stageId, launchPhase, insertAt) => {
        onSelectStage(stageId);
        onSelectTemplate(null);
        onAdd(stageId, launchPhase, insertAt);
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
    activeStageId,
    selectedTemplateId,
    collapsedStageIds,
    canvasPositions,
    fields,
    onToggleStageCollapse,
    onAdd,
    onSelectStage,
    onSelectTemplate,
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
      onNodeDragStart={onNodeDragStart}
      onNodeDrag={onNodeDrag}
      onNodeDragStop={onNodeDragStop}
      onPaneClick={() => {
        onSelectTemplate(null);
        onSelectStage("");
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
  canvasPositions,
  collapsedStageIds,
  fields,
  onSelectStage,
  onSelectTemplate,
  onAdd,
  onMoveTemplate,
  onCanvasPositionsChange,
  onToggleStageCollapse,
}: {
  stages: StageOption[];
  templates: AutomationTaskTemplate[];
  stageTransitions: AutomationStageTransition[];
  activeStageId: string | null;
  selectedTemplateId: string | null;
  canvasPositions: AutomationCanvasNodePositions;
  collapsedStageIds: ReadonlySet<string>;
  fields: EntityField[];
  onSelectStage: (stageId: string) => void;
  onSelectTemplate: (id: string | null) => void;
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
  onCanvasPositionsChange: (positions: AutomationCanvasNodePositions) => void;
  onToggleStageCollapse: (stageId: string) => void;
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
          canvasPositions={canvasPositions}
          collapsedStageIds={collapsedStageIds}
          fields={fields}
          onSelectStage={onSelectStage}
          onSelectTemplate={onSelectTemplate}
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
