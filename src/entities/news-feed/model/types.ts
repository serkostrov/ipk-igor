export type FeedLinkKind = "external" | "google_form";

export type FeedAttachment = {
  id: string;
  fileName: string;
  extension: string;
  sizeBytes: number;
  mimeType: string;
  storagePath: string;
  sortOrder: number;
  createdAt: string | null;
};

export type FeedLink = {
  id: string;
  kind: FeedLinkKind;
  url: string;
  title: string;
  sortOrder: number;
};

export type FeedPollOption = {
  id: string;
  label: string;
  sortOrder: number;
  voteCount: number;
  selected: boolean;
};

export type FeedPoll = {
  id: string;
  question: string;
  allowMultiple: boolean;
  endsAt: string | null;
  ended: boolean;
  hasVoted: boolean;
  showResults: boolean;
  totalVotes: number;
  myOptionIds: string[];
  options: FeedPollOption[];
};

export type FeedComment = {
  id: string;
  authorId: string;
  body: string;
  editedAt: string | null;
  createdAt: string;
};

export type FeedPost = {
  id: string;
  authorId: string;
  title: string;
  body: string;
  targetsAll: boolean;
  legalEntityIds: string[];
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  attachments: FeedAttachment[];
  links: FeedLink[];
  poll: FeedPoll | null;
  comments: FeedComment[];
  commentCount: number;
  canManage: boolean;
};

export type FeedLinkInput = {
  kind: FeedLinkKind;
  url: string;
  title: string;
};

export type FeedPollInput = {
  question: string;
  allowMultiple: boolean;
  endsAt: string | null;
  options: string[];
};

export type FeedPostInput = {
  title: string;
  body: string;
  targetsAll: boolean;
  legalEntityIds: string[];
  links: FeedLinkInput[];
  poll: FeedPollInput | null;
  /** When editing: keep existing poll if votes already cast. */
  keepPoll?: boolean;
};

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asBool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export function normalizeFeedAttachment(value: unknown): FeedAttachment | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = asString(row.id).trim();
  const storagePath = asString(row.storage_path).trim();
  if (!id || !storagePath) return null;
  return {
    id,
    fileName: asString(row.file_name, "file"),
    extension: asString(row.extension),
    sizeBytes: asNumber(row.size_bytes),
    mimeType: asString(row.mime_type, "application/octet-stream"),
    storagePath,
    sortOrder: asNumber(row.sort_order),
    createdAt: asNullableString(row.created_at),
  };
}

export function normalizeFeedLink(value: unknown): FeedLink | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = asString(row.id).trim();
  const kind = asString(row.kind).trim();
  const url = asString(row.url).trim();
  if (!id || !url) return null;
  if (kind !== "external" && kind !== "google_form") return null;
  return {
    id,
    kind,
    url,
    title: asString(row.title),
    sortOrder: asNumber(row.sort_order),
  };
}

export function normalizeFeedPoll(value: unknown): FeedPoll | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = asString(row.id).trim();
  const question = asString(row.question).trim();
  if (!id || !question) return null;
  const optionsRaw = Array.isArray(row.options) ? row.options : [];
  const options: FeedPollOption[] = [];
  for (const item of optionsRaw) {
    const opt = asRecord(item);
    if (!opt) continue;
    const optId = asString(opt.id).trim();
    const label = asString(opt.label).trim();
    if (!optId || !label) continue;
    options.push({
      id: optId,
      label,
      sortOrder: asNumber(opt.sort_order),
      voteCount: asNumber(opt.vote_count),
      selected: asBool(opt.selected),
    });
  }
  return {
    id,
    question,
    allowMultiple: asBool(row.allow_multiple),
    endsAt: asNullableString(row.ends_at),
    ended: asBool(row.ended),
    hasVoted: asBool(row.has_voted),
    showResults: asBool(row.show_results),
    totalVotes: asNumber(row.total_votes),
    myOptionIds: asStringArray(row.my_option_ids),
    options,
  };
}

export function normalizeFeedComment(value: unknown): FeedComment | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = asString(row.id).trim();
  const authorId = asString(row.author_id).trim();
  const createdAt = asString(row.created_at).trim();
  if (!id || !authorId || !createdAt) return null;
  return {
    id,
    authorId,
    body: asString(row.body),
    editedAt: asNullableString(row.edited_at),
    createdAt,
  };
}

export function normalizeFeedPost(value: unknown): FeedPost | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = asString(row.id).trim();
  const authorId = asString(row.author_id).trim();
  const createdAt = asString(row.created_at).trim();
  if (!id || !authorId || !createdAt) return null;

  const attachments: FeedAttachment[] = [];
  for (const item of Array.isArray(row.attachments) ? row.attachments : []) {
    const parsed = normalizeFeedAttachment(item);
    if (parsed) attachments.push(parsed);
  }

  const links: FeedLink[] = [];
  for (const item of Array.isArray(row.links) ? row.links : []) {
    const parsed = normalizeFeedLink(item);
    if (parsed) links.push(parsed);
  }

  const comments: FeedComment[] = [];
  for (const item of Array.isArray(row.comments) ? row.comments : []) {
    const parsed = normalizeFeedComment(item);
    if (parsed) comments.push(parsed);
  }

  return {
    id,
    authorId,
    title: asString(row.title),
    body: asString(row.body),
    targetsAll: asBool(row.targets_all),
    legalEntityIds: asStringArray(row.legal_entity_ids),
    createdAt,
    updatedAt: asString(row.updated_at, createdAt),
    editedAt: asNullableString(row.edited_at),
    attachments,
    links,
    poll: normalizeFeedPoll(row.poll),
    comments,
    commentCount: asNumber(row.comment_count, comments.length),
    canManage: asBool(row.can_manage),
  };
}
