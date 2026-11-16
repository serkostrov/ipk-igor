import { parsePath, type AppLocation } from "@/shared/lib/navigation";

const URL_RE =
  /https?:\/\/[^\s<>"')\]]+|\/e\/[A-Za-z0-9_-]+\/r\/[A-Za-z0-9_-]+(?:\/t\/[A-Za-z0-9_-]+)?/gi;

export type MessengerTextPart =
  | { type: "text"; value: string }
  | {
      type: "link";
      value: string;
      href: string;
      location: AppLocation | null;
    };

function tryParseCrmPath(value: string): AppLocation | null {
  try {
    if (value.startsWith("/")) return parsePath(value);
    const url = new URL(value);
    return parsePath(url.pathname);
  } catch {
    return null;
  }
}

export function splitMessengerText(text: string): MessengerTextPart[] {
  if (!text) return [];
  const parts: MessengerTextPart[] = [];
  let lastIndex = 0;
  const re = new RegExp(URL_RE.source, URL_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) != null) {
    const value = match[0] ?? "";
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    const href = value.startsWith("/") ? value : value;
    const location =
      value.startsWith("/e/") || href.includes("/e/")
        ? tryParseCrmPath(value)
        : null;
    const crmLocation =
      location?.type === "record" || location?.type === "entity"
        ? location
        : null;
    parts.push({
      type: "link",
      value,
      href,
      location: crmLocation,
    });
    lastIndex = match.index + value.length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }
  return parts;
}
