import type { Entity } from "../model/types";
import {
  getSystemUsersEntity,
  getSystemUserName,
} from "../model/system-entities";

export type MentionableUser = {
  /** Users-entity record id. */
  id: string;
  authUserId: string | null;
  name: string;
};

/** Users available for `@имя` mentions, sorted by name length (longest first). */
export function listMentionableUsers(
  entities: readonly Entity[],
): MentionableUser[] {
  const users = getSystemUsersEntity(entities);
  if (!users) return [];
  return users.records
    .map((record) => {
      const name = getSystemUserName(entities, record.id)?.trim() ?? "";
      if (!name || name === "Без названия") return null;
      return {
        id: record.id,
        authUserId: record.authUserId,
        name,
      } satisfies MentionableUser;
    })
    .filter((item): item is MentionableUser => item != null)
    .sort(
      (a, b) =>
        b.name.length - a.name.length || a.name.localeCompare(b.name, "ru"),
    );
}

function normalizeForMatch(value: string) {
  return value.trim().toLocaleLowerCase("ru");
}

/** Filter users for the `@query` autocomplete. */
export function filterMentionableUsers(
  users: readonly MentionableUser[],
  query: string,
): MentionableUser[] {
  const q = normalizeForMatch(query);
  if (!q)
    return users.slice().sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return users
    .filter((user) => normalizeForMatch(user.name).includes(q))
    .sort((a, b) => {
      const aName = normalizeForMatch(a.name);
      const bName = normalizeForMatch(b.name);
      const aStarts = aName.startsWith(q) ? 0 : 1;
      const bStarts = bName.startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.name.localeCompare(b.name, "ru");
    });
}

/**
 * Detect `@…` being typed at `caret` in `text`.
 * Returns the query after `@` and the absolute start index of `@`.
 */
export function findActiveMentionQuery(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, Math.max(0, caret));
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0) {
    const prev = before[at - 1]!;
    if (!/\s/.test(prev) && prev !== "(" && prev !== "[" && prev !== "«") {
      return null;
    }
  }
  const query = before.slice(at + 1);
  // Mentions are a single line; stop if user already pressed Enter.
  if (query.includes("\n")) return null;
  // Allow spaces inside the query while picking a full name.
  if (query.length > 80) return null;
  return { start: at, query };
}

/** Insert `@Name ` replacing the active `@query` span. */
export function applyMentionInsertion(
  text: string,
  caret: number,
  mentionStart: number,
  userName: string,
): { text: string; caret: number } {
  const before = text.slice(0, mentionStart);
  const after = text.slice(caret);
  const inserted = `@${userName}`;
  const needsSpace = after.length === 0 || !/^\s/.test(after);
  const chunk = needsSpace ? `${inserted} ` : inserted;
  return {
    text: `${before}${chunk}${after}`,
    caret: before.length + chunk.length,
  };
}

/**
 * Resolve `@Name` spans against known users (longest names first).
 * Returns unique user ids in mention order.
 */
export function extractMentionedUserIds(
  text: string,
  users: readonly MentionableUser[],
): string[] {
  if (!text.includes("@") || users.length === 0) return [];
  const lower = text.toLocaleLowerCase("ru");
  const found: string[] = [];
  const seen = new Set<string>();
  // Walk every `@` and try to match the longest known name.
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "@") continue;
    if (i > 0) {
      const prev = text[i - 1]!;
      if (!/\s/.test(prev) && prev !== "(" && prev !== "[" && prev !== "«") {
        continue;
      }
    }
    const restLower = lower.slice(i + 1);
    for (const user of users) {
      const needle = normalizeForMatch(user.name);
      if (!needle || !restLower.startsWith(needle)) continue;
      const end = i + 1 + user.name.length;
      const next = text[end];
      if (next != null && !/\s|[.,;:!?)\]»]/.test(next)) continue;
      if (!seen.has(user.id)) {
        seen.add(user.id);
        found.push(user.id);
      }
      break;
    }
  }
  return found;
}

/** Newly mentioned users compared to previous text. */
export function extractNewMentionedUserIds(
  previousText: string,
  nextText: string,
  users: readonly MentionableUser[],
): string[] {
  const prev = new Set(extractMentionedUserIds(previousText, users));
  return extractMentionedUserIds(nextText, users).filter((id) => !prev.has(id));
}

export type RecordMentionSegment =
  | { kind: "text"; value: string }
  | { kind: "mention"; value: string; userId: string };

/** Split note text into plain + mention segments for rendering. */
export function splitRecordMentionSegments(
  text: string,
  users: readonly MentionableUser[],
): RecordMentionSegment[] {
  if (!text) return [];
  if (!text.includes("@") || users.length === 0) {
    return [{ kind: "text", value: text }];
  }

  const segments: RecordMentionSegment[] = [];
  let cursor = 0;
  const lower = text.toLocaleLowerCase("ru");

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "@") continue;
    if (i > 0) {
      const prev = text[i - 1]!;
      if (!/\s/.test(prev) && prev !== "(" && prev !== "[" && prev !== "«") {
        continue;
      }
    }
    const restLower = lower.slice(i + 1);
    let matched: MentionableUser | null = null;
    for (const user of users) {
      const needle = normalizeForMatch(user.name);
      if (!needle || !restLower.startsWith(needle)) continue;
      const end = i + 1 + user.name.length;
      const next = text[end];
      if (next != null && !/\s|[.,;:!?)\]»]/.test(next)) continue;
      matched = user;
      break;
    }
    if (!matched) continue;
    if (i > cursor) {
      segments.push({ kind: "text", value: text.slice(cursor, i) });
    }
    const end = i + 1 + matched.name.length;
    segments.push({
      kind: "mention",
      value: text.slice(i, end),
      userId: matched.id,
    });
    cursor = end;
    i = end - 1;
  }

  if (cursor < text.length) {
    segments.push({ kind: "text", value: text.slice(cursor) });
  }
  return segments.length > 0 ? segments : [{ kind: "text", value: text }];
}
