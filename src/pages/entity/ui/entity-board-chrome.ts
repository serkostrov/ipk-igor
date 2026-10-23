import {
  getEntityPagePanel,
  hasEntityPageLayout,
  type Entity,
} from "@/entities/entity";

export function entityBoardChromeCollapsedKey(entityId: string) {
  return `entity-board-chrome-collapsed:${entityId}`;
}

export function parseBoardChromeCollapsed(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function entityHasBoardChrome(entity: Entity) {
  const layout = entity.pageLayout;
  if (!layout || !hasEntityPageLayout(entity)) return false;
  const hasFiltersPanel = layout.panels.some(
    (panel) => panel.type === "filters",
  );
  const hasChromeRow = layout.rows.some((row) =>
    row.panelIds.some((id) => {
      const panel = getEntityPagePanel(layout, id);
      return panel != null && panel.type !== "records";
    }),
  );
  return hasChromeRow || !hasFiltersPanel;
}
