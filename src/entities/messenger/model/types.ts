export type MessengerChatKind = "direct" | "group";

export type MessengerChatStatus = "active" | "archived" | "deleted";

export type MessengerMemberRole = "admin" | "member";

export type MessengerMemberStatus = "active" | "left" | "removed";

export type MessengerMessageKind = "text" | "system";

export type MessengerChat = {
  id: string;
  kind: MessengerChatKind;
  title: string;
  avatarPath: string | null;
  createdBy: string;
  status: MessengerChatStatus;
  entityId: string | null;
  recordId: string | null;
  entityTitle: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageHasAttachment: boolean;
  pinnedMessageId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Current user's membership (joined from members query). */
  myRole: MessengerMemberRole;
  myLastReadAt: string | null;
  myIsPinned: boolean;
  myIsMuted: boolean;
  unreadCount: number;
  /** Active member auth user ids. */
  memberIds: string[];
};

export type MessengerMember = {
  id: string;
  chatId: string;
  userId: string;
  role: MessengerMemberRole;
  status: MessengerMemberStatus;
  joinedAt: string;
  leftAt: string | null;
  lastReadAt: string | null;
  isPinned: boolean;
  isMuted: boolean;
};

export type MessengerAttachment = {
  id: string;
  messageId: string;
  fileName: string;
  extension: string;
  sizeBytes: number;
  mimeType: string;
  storagePath: string;
  uploadedBy: string;
  createdAt: string;
};

export type MessengerMessage = {
  id: string;
  chatId: string;
  authorId: string | null;
  kind: MessengerMessageKind;
  body: string;
  replyToId: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  attachments: MessengerAttachment[];
};

export type MessengerDraft = {
  text: string;
  replyToId: string | null;
};

export type MessengerAttachmentMeta = {
  file_name: string;
  extension: string;
  size_bytes: number;
  mime_type: string;
  storage_path: string;
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

export function normalizeAttachment(
  row: Record<string, unknown>,
): MessengerAttachment | null {
  const id = asString(row.id);
  const messageId = asString(row.message_id ?? row.messageId);
  const storagePath = asString(row.storage_path ?? row.storagePath);
  if (!id || !messageId || !storagePath) return null;
  return {
    id,
    messageId,
    fileName: asString(row.file_name ?? row.fileName, "file"),
    extension: asString(row.extension),
    sizeBytes: asNumber(row.size_bytes ?? row.sizeBytes),
    mimeType: asString(
      row.mime_type ?? row.mimeType,
      "application/octet-stream",
    ),
    storagePath,
    uploadedBy: asString(row.uploaded_by ?? row.uploadedBy),
    createdAt: asString(
      row.created_at ?? row.createdAt,
      new Date().toISOString(),
    ),
  };
}

export function normalizeMessage(
  row: Record<string, unknown>,
  attachments: MessengerAttachment[] = [],
): MessengerMessage | null {
  const id = asString(row.id);
  const chatId = asString(row.chat_id ?? row.chatId);
  if (!id || !chatId) return null;
  const kindRaw = asString(row.kind, "text");
  const kind: MessengerMessageKind = kindRaw === "system" ? "system" : "text";
  return {
    id,
    chatId,
    authorId: asNullableString(row.author_id ?? row.authorId),
    kind,
    body: asString(row.body),
    replyToId: asNullableString(row.reply_to_id ?? row.replyToId),
    editedAt: asNullableString(row.edited_at ?? row.editedAt),
    deletedAt: asNullableString(row.deleted_at ?? row.deletedAt),
    createdAt: asString(
      row.created_at ?? row.createdAt,
      new Date().toISOString(),
    ),
    attachments,
  };
}

export function normalizeMember(
  row: Record<string, unknown>,
): MessengerMember | null {
  const id = asString(row.id);
  const chatId = asString(row.chat_id ?? row.chatId);
  const userId = asString(row.user_id ?? row.userId);
  if (!id || !chatId || !userId) return null;
  const roleRaw = asString(row.role, "member");
  const statusRaw = asString(row.status, "active");
  return {
    id,
    chatId,
    userId,
    role: roleRaw === "admin" ? "admin" : "member",
    status:
      statusRaw === "left" || statusRaw === "removed" ? statusRaw : "active",
    joinedAt: asString(row.joined_at ?? row.joinedAt, new Date().toISOString()),
    leftAt: asNullableString(row.left_at ?? row.leftAt),
    lastReadAt: asNullableString(row.last_read_at ?? row.lastReadAt),
    isPinned: asBool(row.is_pinned ?? row.isPinned),
    isMuted: asBool(row.is_muted ?? row.isMuted),
  };
}

export function normalizeChat(
  row: Record<string, unknown>,
  extras?: Partial<
    Pick<
      MessengerChat,
      | "myRole"
      | "myLastReadAt"
      | "myIsPinned"
      | "myIsMuted"
      | "unreadCount"
      | "memberIds"
    >
  >,
): MessengerChat | null {
  const id = asString(row.id);
  if (!id) return null;
  const kindRaw = asString(row.kind, "group");
  const statusRaw = asString(row.status, "active");
  return {
    id,
    kind: kindRaw === "direct" ? "direct" : "group",
    title: asString(row.title),
    avatarPath: asNullableString(row.avatar_path ?? row.avatarPath),
    createdBy: asString(row.created_by ?? row.createdBy),
    status:
      statusRaw === "archived" || statusRaw === "deleted"
        ? statusRaw
        : "active",
    entityId: asNullableString(row.entity_id ?? row.entityId),
    recordId: asNullableString(row.record_id ?? row.recordId),
    entityTitle: asNullableString(row.entity_title ?? row.entityTitle),
    lastMessageAt: asNullableString(row.last_message_at ?? row.lastMessageAt),
    lastMessagePreview: asNullableString(
      row.last_message_preview ?? row.lastMessagePreview,
    ),
    lastMessageHasAttachment: asBool(
      row.last_message_has_attachment ?? row.lastMessageHasAttachment,
    ),
    pinnedMessageId: asNullableString(
      row.pinned_message_id ?? row.pinnedMessageId,
    ),
    createdAt: asString(
      row.created_at ?? row.createdAt,
      new Date().toISOString(),
    ),
    updatedAt: asString(
      row.updated_at ?? row.updatedAt,
      new Date().toISOString(),
    ),
    myRole: extras?.myRole ?? "member",
    myLastReadAt: extras?.myLastReadAt ?? null,
    myIsPinned: extras?.myIsPinned ?? false,
    myIsMuted: extras?.myIsMuted ?? false,
    unreadCount: extras?.unreadCount ?? 0,
    memberIds: extras?.memberIds ?? [],
  };
}
