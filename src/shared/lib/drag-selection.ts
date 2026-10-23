let lockCount = 0;
let previousUserSelect = "";
let previousWebkitUserSelect = "";

/** Prevents text selection while a drag gesture is active. */
export function lockDragSelection() {
  if (typeof document === "undefined") return;

  window.getSelection()?.removeAllRanges();

  if (lockCount === 0) {
    previousUserSelect = document.body.style.userSelect;
    previousWebkitUserSelect = document.body.style.webkitUserSelect;
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";
    document.body.dataset.dragging = "";
  }

  lockCount += 1;
}

export function unlockDragSelection() {
  if (typeof document === "undefined") return;

  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0) return;

  document.body.style.userSelect = previousUserSelect;
  document.body.style.webkitUserSelect = previousWebkitUserSelect;
  delete document.body.dataset.dragging;
  window.getSelection()?.removeAllRanges();
}

/** Sets `document.body` cursor for the duration of a drag; returns previous value. */
export function setBodyCursor(cursor: string): string {
  if (typeof document === "undefined") return "";
  const previous = document.body.style.cursor;
  document.body.style.cursor = cursor;
  return previous;
}

export function restoreBodyCursor(previous: string) {
  if (typeof document === "undefined") return;
  document.body.style.cursor = previous;
}
