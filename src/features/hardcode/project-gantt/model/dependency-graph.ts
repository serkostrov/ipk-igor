import type { WorkItemDependencyType } from "./contracts";

export type DependencyGraphEdge = {
  id?: string;
  predecessorWorkItemId: string;
  successorWorkItemId: string;
  dependencyType?: WorkItemDependencyType;
};

export function wouldCreateDependencyCycle(
  edges: readonly DependencyGraphEdge[],
  candidate: Pick<
    DependencyGraphEdge,
    "predecessorWorkItemId" | "successorWorkItemId"
  >,
  excludeEdgeId?: string,
): boolean {
  if (candidate.predecessorWorkItemId === candidate.successorWorkItemId) {
    return true;
  }

  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    if (excludeEdgeId && edge.id === excludeEdgeId) continue;
    const targets = outgoing.get(edge.predecessorWorkItemId) ?? [];
    targets.push(edge.successorWorkItemId);
    outgoing.set(edge.predecessorWorkItemId, targets);
  }

  const pending = [candidate.successorWorkItemId];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === candidate.predecessorWorkItemId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(outgoing.get(current) ?? []));
  }
  return false;
}
