import { useEffect, useCallback, memo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
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
import { Flag, Lock, Plus, Timer, User, Zap } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type {
  AutomationCanvasLayout,
  AutomationTaskTemplate,
} from "@/entities/automation";
import { AUTOMATION_ASSIGNEE_TYPE_LABELS } from "@/entities/automation";

const COL_W = 220;
const COL_GAP = 36;
const ORIGIN_X = 32;
const STAGE_Y = 28;
const FLOW_Y = 130;
const ROW_GAP = 28;
const TASK_H = 92;
const TRIGGER_H = 72;
const EMPTY_H = 44;

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

const edgeTypes: EdgeTypes = {
  floating: memo(FloatingEdge),
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
};
type EmptyData = { stageId: string };

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
  const { template, selected } = data;
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
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{template.name}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            #{template.stepOrder}
            {template.kind === "decision" ? " · решение" : ""}
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

function EmptyNode({ data }: NodeProps<Node<EmptyData, "empty">>) {
  return (
    <button
      type="button"
      className="nodrag nopan relative flex h-11 w-[220px] items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card/80 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      data-stage-add={data.stageId}
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
      <Plus className="size-3.5" />
      Добавить задачу
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
  empty: memo(EmptyNode),
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
) {
  return templates
    .filter((item) => item.triggerOptionId === stageId)
    .slice()
    .sort(
      (a, b) => a.stepOrder - b.stepOrder || a.name.localeCompare(b.name, "ru"),
    );
}

function columnIndexFromX(x: number, stageCount: number) {
  const index = Math.round((x - ORIGIN_X) / (COL_W + COL_GAP));
  return Math.max(0, Math.min(stageCount - 1, index));
}

function stepOrderFromY(y: number) {
  const start = FLOW_Y + TRIGGER_H + ROW_GAP;
  if (y <= start) return 0;
  return Math.max(0, Math.round((y - start) / (TASK_H + ROW_GAP)));
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
  activeStageId: string | null;
  selectedTemplateId: string | null;
  canvasLayout: AutomationCanvasLayout;
}): { nodes: Node[]; edges: Edge[] } {
  const { stages, templates, activeStageId, selectedTemplateId, canvasLayout } =
    input;
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
      edges.push({
        id: `map-${prev.id}-${stage.id}`,
        source: `stage:${prev.id}`,
        target: stageNodeId,
        type: "floating",
        style: { stroke: "#d4d4d8", strokeWidth: 1.5 },
      });
    }

    const triggerId = `trigger:${stage.id}`;
    nodes.push({
      id: triggerId,
      type: "trigger",
      position: resolvePosition(
        triggerId,
        { x: colX, y: FLOW_Y },
        canvasLayout,
      ),
      data: { stageId: stage.id },
      selectable: false,
    });
    edges.push({
      id: `down-${stage.id}`,
      source: stageNodeId,
      target: triggerId,
      type: "floating",
      style: {
        stroke: stage.id === activeStageId ? "#f59e0b" : "#cbd5e1",
        strokeWidth: stage.id === activeStageId ? 2 : 1.5,
      },
    });

    let prevId = triggerId;
    let y = FLOW_Y + TRIGGER_H + ROW_GAP;

    if (stageTasks.length === 0) {
      const emptyId = `empty:${stage.id}`;
      nodes.push({
        id: emptyId,
        type: "empty",
        position: resolvePosition(emptyId, { x: colX, y }, canvasLayout),
        data: { stageId: stage.id },
        draggable: false,
      });
      edges.push({
        id: `e-${prevId}-${emptyId}`,
        source: prevId,
        target: emptyId,
        type: "floating",
        style: { stroke: "#e4e4e7", strokeWidth: 1.25, strokeDasharray: "4 4" },
      });
      prevId = emptyId;
      y += EMPTY_H + ROW_GAP;
    } else {
      for (const template of stageTasks) {
        nodes.push({
          id: template.id,
          type: "task",
          position: resolvePosition(template.id, { x: colX, y }, canvasLayout),
          data: {
            template,
            selected: selectedTemplateId === template.id,
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
      }
    }

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
      selectable: false,
    });
    edges.push({
      id: `e-${prevId}-${endId}`,
      source: prevId,
      target: endId,
      type: "floating",
      style: { stroke: "#a1a1aa", strokeWidth: 1.5 },
    });
  });

  return { nodes, edges };
}

function FlowInner({
  stages,
  templates,
  activeStageId,
  selectedTemplateId,
  canvasLayout,
  onSelectStage,
  onSelectTemplate,
  onAdd,
  onMoveTemplate,
  onCanvasLayoutChange,
  fitKey,
}: {
  stages: StageOption[];
  templates: AutomationTaskTemplate[];
  activeStageId: string | null;
  selectedTemplateId: string | null;
  canvasLayout: AutomationCanvasLayout;
  onSelectStage: (stageId: string) => void;
  onSelectTemplate: (id: string | null) => void;
  onAdd: (stageId: string) => void;
  onMoveTemplate: (
    templateId: string,
    stageId: string,
    stepOrder: number,
  ) => void;
  onCanvasLayoutChange: (layout: AutomationCanvasLayout) => void;
  fitKey: string;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const dragStartRef = useRef<{ id: string; x: number; y: number } | null>(
    null,
  );
  const canvasLayoutRef = useRef(canvasLayout);

  useEffect(() => {
    canvasLayoutRef.current = canvasLayout;
  }, [canvasLayout]);

  useEffect(() => {
    const layout = buildLayout({
      stages,
      templates,
      activeStageId,
      selectedTemplateId,
      canvasLayout,
    });
    setNodes(layout.nodes);
    setEdges(layout.edges);
  }, [
    fitKey,
    stages,
    templates,
    activeStageId,
    selectedTemplateId,
    canvasLayout,
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
      if (node.type === "empty") {
        const stageId = (node.data as EmptyData).stageId;
        onSelectStage(stageId);
        onSelectTemplate(null);
        onAdd(stageId);
      }
    },
    [onSelectStage, onSelectTemplate, onAdd],
  );

  const onNodeDragStart: OnNodeDrag = useCallback((_event, node) => {
    dragStartRef.current = {
      id: node.id,
      x: node.position.x,
      y: node.position.y,
    };
  }, []);

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, node) => {
      const start = dragStartRef.current;
      dragStartRef.current = null;
      if (!start || start.id !== node.id) return;
      if (node.type === "empty") return;

      const movedFar =
        Math.hypot(node.position.x - start.x, node.position.y - start.y) > 8;
      if (!movedFar) return;

      onCanvasLayoutChange({
        ...canvasLayoutRef.current,
        [node.id]: { x: node.position.x, y: node.position.y },
      });

      if (node.type !== "task" || stages.length === 0) return;

      const colIndex = columnIndexFromX(node.position.x, stages.length);
      const stage = stages[colIndex];
      if (!stage) return;
      const stepOrder = stepOrderFromY(node.position.y);
      onSelectStage(stage.id);
      onSelectTemplate(node.id);
      onMoveTemplate(node.id, stage.id, stepOrder);
    },
    [
      stages,
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
      onNodeDragStart={onNodeDragStart}
      onNodeDragStop={onNodeDragStop}
      onPaneClick={() => onSelectTemplate(null)}
      nodesDraggable
      nodesConnectable={false}
      elementsSelectable
      selectNodesOnDrag={false}
      deleteKeyCode={null}
      minZoom={0.15}
      maxZoom={1.25}
      fitView
      fitViewOptions={{ padding: 0.1, maxZoom: 0.85 }}
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
                : node.type === "empty"
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
  activeStageId,
  selectedTemplateId,
  canvasLayout,
  onSelectStage,
  onSelectTemplate,
  onAdd,
  onMoveTemplate,
  onCanvasLayoutChange,
}: {
  stages: StageOption[];
  templates: AutomationTaskTemplate[];
  activeStageId: string | null;
  selectedTemplateId: string | null;
  canvasLayout: AutomationCanvasLayout;
  onSelectStage: (stageId: string) => void;
  onSelectTemplate: (id: string | null) => void;
  onAdd: (stageId: string) => void;
  onMoveTemplate: (
    templateId: string,
    stageId: string,
    stepOrder: number,
  ) => void;
  onCanvasLayoutChange: (layout: AutomationCanvasLayout) => void;
}) {
  const fitKey = [
    stages.map((s) => s.id).join(","),
    templates
      .map((t) => `${t.id}:${t.triggerOptionId}:${t.stepOrder}`)
      .join(","),
  ].join("|");

  return (
    <ReactFlowProvider>
      <div className="relative h-full min-h-[420px] w-full">
        <FlowInner
          stages={stages}
          templates={templates}
          activeStageId={activeStageId}
          selectedTemplateId={selectedTemplateId}
          canvasLayout={canvasLayout}
          onSelectStage={onSelectStage}
          onSelectTemplate={onSelectTemplate}
          onAdd={onAdd}
          onMoveTemplate={onMoveTemplate}
          onCanvasLayoutChange={onCanvasLayoutChange}
          fitKey={fitKey}
        />
      </div>
    </ReactFlowProvider>
  );
}
