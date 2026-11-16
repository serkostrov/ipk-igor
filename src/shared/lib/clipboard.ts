/**
 * Copy plain text to the clipboard.
 * Tries the async Clipboard API first, then `document.execCommand("copy")`
 * (needed when writeText is blocked or user activation was already spent).
 */
export async function copyTextToClipboard(value: string): Promise<void> {
  const text = value;
  if (!text) throw new Error("Нечего копировать");

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fall through — writeText often fails after an awaited image write
    // or when the Permissions Policy / focus state blocks it.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.appendChild(textarea);

  const selection = document.getSelection();
  const previous =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied: boolean;
  try {
    copied = Boolean(document.execCommand("copy"));
  } catch {
    copied = false;
  } finally {
    textarea.remove();
    if (selection && previous) {
      selection.removeAllRanges();
      selection.addRange(previous);
    }
  }

  if (!copied) throw new Error("Не удалось скопировать");
}
