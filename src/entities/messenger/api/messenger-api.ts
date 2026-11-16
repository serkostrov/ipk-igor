import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";
import {
  assertMessengerFileAllowed,
  getFileExtension,
} from "../lib/file-policy";
import {
  normalizeAttachment,
  normalizeChat,
  normalizeMember,
  normalizeMessage,
  type MessengerAttachment,
  type MessengerAttachmentMeta,
  type MessengerChat,
  type MessengerMember,
  type MessengerMessage,
} from "../model/types";

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured");
  }
  return supabase;
}

async function countUnreadForChat(
  chatId: string,
  lastReadAt: string | null,
  authUserId: string,
): Promise<number> {
  const client = requireClient();
  let query = client
    .from("messenger_messages")
    .select("id", { count: "exact", head: true })
    .eq("chat_id", chatId)
    .eq("kind", "text")
    .is("deleted_at", null)
    .neq("author_id", authUserId);
  if (lastReadAt) {
    query = query.gt("created_at", lastReadAt);
  }
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function fetchMessengerChats(
  authUserId: string,
): Promise<MessengerChat[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const client = requireClient();

  const { data: memberships, error: memError } = await client
    .from("messenger_members")
    .select("*")
    .eq("user_id", authUserId)
    .eq("status", "active");
  if (memError) throw memError;
  const myMembers = (memberships ?? [])
    .map((row) => normalizeMember(row as Record<string, unknown>))
    .filter((item): item is MessengerMember => item != null);
  if (myMembers.length === 0) return [];

  const chatIds = myMembers.map((m) => m.chatId);
  const { data: chatRows, error: chatError } = await client
    .from("messenger_chats")
    .select("*")
    .in("id", chatIds)
    .neq("status", "deleted");
  if (chatError) throw chatError;

  const { data: allMembers, error: allMemError } = await client
    .from("messenger_members")
    .select("*")
    .in("chat_id", chatIds)
    .eq("status", "active");
  if (allMemError) throw allMemError;

  const membersByChat = new Map<string, string[]>();
  for (const row of allMembers ?? []) {
    const member = normalizeMember(row as Record<string, unknown>);
    if (!member) continue;
    const list = membersByChat.get(member.chatId) ?? [];
    list.push(member.userId);
    membersByChat.set(member.chatId, list);
  }

  const myByChat = new Map(myMembers.map((m) => [m.chatId, m]));
  const chats: MessengerChat[] = [];

  for (const row of chatRows ?? []) {
    const raw = row as Record<string, unknown>;
    const mine = myByChat.get(String(raw.id));
    if (!mine) continue;
    const unreadCount = await countUnreadForChat(
      mine.chatId,
      mine.lastReadAt,
      authUserId,
    );
    const chat = normalizeChat(raw, {
      myRole: mine.role,
      myLastReadAt: mine.lastReadAt,
      myIsPinned: mine.isPinned,
      myIsMuted: mine.isMuted,
      unreadCount,
      memberIds: membersByChat.get(mine.chatId) ?? [],
    });
    if (chat) chats.push(chat);
  }

  return chats;
}

export async function fetchChatMembers(
  chatId: string,
): Promise<MessengerMember[]> {
  const client = requireClient();
  const { data, error } = await client
    .from("messenger_members")
    .select("*")
    .eq("chat_id", chatId)
    .eq("status", "active")
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .map((row) => normalizeMember(row as Record<string, unknown>))
    .filter((item): item is MessengerMember => item != null);
}

export async function fetchMessagesPage(
  chatId: string,
  options?: { before?: string | null; limit?: number },
): Promise<{ messages: MessengerMessage[]; hasMore: boolean }> {
  const client = requireClient();
  const limit = options?.limit ?? 40;
  let query = client
    .from("messenger_messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (options?.before) {
    query = query.lt("created_at", options.before);
  }
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const messageIds = page.map((row) => String((row as { id: string }).id));

  let attachments: MessengerAttachment[] = [];
  if (messageIds.length > 0) {
    const { data: attRows, error: attError } = await client
      .from("messenger_attachments")
      .select("*")
      .in("message_id", messageIds);
    if (attError) throw attError;
    attachments = (attRows ?? [])
      .map((row) => normalizeAttachment(row as Record<string, unknown>))
      .filter((item): item is MessengerAttachment => item != null);
  }

  const byMessage = new Map<string, MessengerAttachment[]>();
  for (const att of attachments) {
    const list = byMessage.get(att.messageId) ?? [];
    list.push(att);
    byMessage.set(att.messageId, list);
  }

  const messages = page
    .map((row) => {
      const raw = row as Record<string, unknown>;
      const id = String(raw.id);
      return normalizeMessage(raw, byMessage.get(id) ?? []);
    })
    .filter((item): item is MessengerMessage => item != null)
    .reverse();

  return { messages, hasMore };
}

export async function getOrCreateDirectChat(
  otherUserId: string,
): Promise<string> {
  const client = requireClient();
  const { data, error } = await client.rpc("messenger_get_or_create_direct", {
    p_other_user_id: otherUserId,
  });
  if (error) throw error;
  return String(data);
}

export async function createGroupChat(input: {
  title: string;
  memberIds: string[];
  entityId?: string | null;
  recordId?: string | null;
  entityTitle?: string | null;
}): Promise<string> {
  const client = requireClient();
  const { data, error } = await client.rpc("messenger_create_group", {
    p_title: input.title,
    p_member_ids: input.memberIds,
    p_entity_id: input.entityId ?? null,
    p_record_id: input.recordId ?? null,
    p_entity_title: input.entityTitle ?? null,
  });
  if (error) throw error;
  return String(data);
}

export async function findChatForRecord(
  entityId: string,
  recordId: string,
): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase
    .from("messenger_chats")
    .select("id")
    .eq("entity_id", entityId)
    .eq("record_id", recordId)
    .neq("status", "deleted")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ? String(data.id) : null;
}

export async function addChatMembers(
  chatId: string,
  memberIds: string[],
): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("messenger_add_members", {
    p_chat_id: chatId,
    p_member_ids: memberIds,
  });
  if (error) throw error;
}

export async function removeChatMember(
  chatId: string,
  userId: string,
): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("messenger_remove_member", {
    p_chat_id: chatId,
    p_user_id: userId,
  });
  if (error) throw error;
}

export async function leaveChat(
  chatId: string,
  newAdminId?: string | null,
): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("messenger_leave", {
    p_chat_id: chatId,
    p_new_admin_id: newAdminId ?? null,
  });
  if (error) throw error;
}

export async function setChatTitle(
  chatId: string,
  title: string,
): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("messenger_set_title", {
    p_chat_id: chatId,
    p_title: title,
  });
  if (error) throw error;
}

export async function setChatAvatar(
  chatId: string,
  avatarPath: string | null,
): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("messenger_set_avatar", {
    p_chat_id: chatId,
    p_avatar_path: avatarPath,
  });
  if (error) throw error;
}

export async function bindChatEntity(
  chatId: string,
  entityId: string,
  recordId: string,
  entityTitle?: string | null,
): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("messenger_bind_entity", {
    p_chat_id: chatId,
    p_entity_id: entityId,
    p_record_id: recordId,
    p_entity_title: entityTitle ?? null,
  });
  if (error) throw error;
}

export async function setChatArchived(
  chatId: string,
  archived: boolean,
): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("messenger_set_archived", {
    p_chat_id: chatId,
    p_archived: archived,
  });
  if (error) throw error;
}

export async function setMemberPinned(
  chatId: string,
  pinned: boolean,
): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("messenger_set_member_pinned", {
    p_chat_id: chatId,
    p_pinned: pinned,
  });
  if (error) throw error;
}

export async function pinMessage(
  chatId: string,
  messageId: string | null,
): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("messenger_pin_message", {
    p_chat_id: chatId,
    p_message_id: messageId,
  });
  if (error) throw error;
}

export async function setChatAdmin(
  chatId: string,
  userId: string,
  isAdmin: boolean,
): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("messenger_set_admin", {
    p_chat_id: chatId,
    p_user_id: userId,
    p_is_admin: isAdmin,
  });
  if (error) throw error;
}

export async function uploadMessengerFile(
  chatId: string,
  file: File,
): Promise<MessengerAttachmentMeta> {
  assertMessengerFileAllowed(file);
  const client = requireClient();
  const extension = getFileExtension(file.name);
  const objectName = `${chatId}/${crypto.randomUUID()}${extension ? `.${extension}` : ""}`;
  const { error } = await client.storage
    .from("messenger-files")
    .upload(objectName, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (error) throw error;
  return {
    file_name: file.name,
    extension,
    size_bytes: file.size,
    mime_type: file.type || "application/octet-stream",
    storage_path: objectName,
  };
}

export async function getMessengerFileUrl(
  storagePath: string,
): Promise<string> {
  const client = requireClient();
  const { data, error } = await client.storage
    .from("messenger-files")
    .createSignedUrl(storagePath, 60 * 60);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Не удалось получить ссылку на файл");
  return data.signedUrl;
}

export async function sendMessage(input: {
  chatId: string;
  body: string;
  replyToId?: string | null;
  files?: File[];
}): Promise<string> {
  const client = requireClient();
  const metas: MessengerAttachmentMeta[] = [];
  for (const file of input.files ?? []) {
    metas.push(await uploadMessengerFile(input.chatId, file));
  }
  const { data, error } = await client.rpc("messenger_send_message", {
    p_chat_id: input.chatId,
    p_body: input.body,
    p_reply_to_id: input.replyToId ?? null,
    p_attachment_meta: metas.length > 0 ? metas : null,
  });
  if (error) throw error;
  return String(data);
}

export async function editMessage(
  messageId: string,
  body: string,
): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("messenger_edit_message", {
    p_message_id: messageId,
    p_body: body,
  });
  if (error) throw error;
}

export async function softDeleteMessage(messageId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("messenger_soft_delete_message", {
    p_message_id: messageId,
  });
  if (error) throw error;
}

export async function markChatRead(chatId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("messenger_mark_read", {
    p_chat_id: chatId,
  });
  if (error) throw error;
}

export async function fetchMessageReads(
  messageId: string,
): Promise<{ userId: string; readAt: string }[]> {
  const client = requireClient();
  const { data, error } = await client
    .from("messenger_message_reads")
    .select("user_id, read_at")
    .eq("message_id", messageId);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    userId: String((row as { user_id: string }).user_id),
    readAt: String((row as { read_at: string }).read_at),
  }));
}

export function subscribeMessenger(
  onChange: (payload?: { table?: string; eventType?: string }) => void,
): () => void {
  if (!isSupabaseConfigured || !supabase) return () => {};
  const channel = supabase
    .channel(`messenger:${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messenger_chats" },
      (payload) =>
        onChange({ table: "messenger_chats", eventType: payload.eventType }),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messenger_members" },
      (payload) =>
        onChange({ table: "messenger_members", eventType: payload.eventType }),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messenger_messages" },
      (payload) =>
        onChange({ table: "messenger_messages", eventType: payload.eventType }),
    )
    .subscribe((status, err) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("[messenger] realtime", status, err?.message ?? err);
      }
    });
  return () => {
    void supabase?.removeChannel(channel);
  };
}
