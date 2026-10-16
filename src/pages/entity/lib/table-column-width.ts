/** Fixed actions column used across entity data tables. */
export const ENTITY_TABLE_ACTIONS_WIDTH = 96;

/** Min width so values like «178 203,14» keep the same type size as other number cols. */
const ENTITY_TABLE_NUMBER_MIN_WIDTH = 112;

/** Chip padding (px-1.5×2) + cell padding allowance for list labels. */
const ENTITY_TABLE_LIST_CHIP_PAD = 28;

/** Sort chevron + gap in the header button. */
const ENTITY_TABLE_SORT_ICON_WIDTH = 18;

/**
 * Minimum column width so the header label fits in full (no ellipsis) and
 * does not overlap neighbors. List columns also grow for the longest option.
 * Number-like columns keep a floor so short headers (e.g. «Итог») don't squeeze.
 */
export function getEntityTableHeaderMinWidth(
  label: string,
  options?: {
    first?: boolean;
    numberLike?: boolean;
    /** Option names for list columns — longest drives min width. */
    listLabels?: readonly string[];
    /** Reserve space for the sort control in the header button. */
    sortable?: boolean;
  },
): number {
  const text = label.trim();
  const padding = options?.first ? 28 : 24;
  // text-[11px] font-semibold uppercase tracking-wide (Cyrillic is wide)
  const textWidth = Math.ceil(text.length * 9.5);
  const sort = options?.sortable === false ? 0 : ENTITY_TABLE_SORT_ICON_WIDTH;
  let width = Math.max(72, padding + textWidth + sort);

  if (options?.numberLike) {
    width = Math.max(width, ENTITY_TABLE_NUMBER_MIN_WIDTH);
  }

  const listLabels = options?.listLabels;
  if (listLabels && listLabels.length > 0) {
    let longest = 0;
    for (const item of listLabels) {
      const length = item.trim().length;
      if (length > longest) longest = length;
    }
    // text-xs chip label (~7px/char for Cyrillic) + chip/cell padding
    const fromList = ENTITY_TABLE_LIST_CHIP_PAD + Math.ceil(longest * 7);
    width = Math.max(width, Math.min(fromList, 280));
  }

  return width;
}
