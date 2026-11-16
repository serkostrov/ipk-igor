import { isSupabaseConfigured } from "@/shared/api/supabase";
import {
  addChatMembers as addChatMembersApi,
  bindChatEntity as bindChatEntityApi,
  createGroupChat as createGroupChatApi,
  editMessage as editMessageApi,
  fetchChatMembers,
  fetchMessengerChats,
  fetchMessagesPage,
  findChatForRecord,
  getOrCreateDirectChat,
  leaveChat as leaveChatApi,
  markChatRead as markChatReadApi,
  pinMessage as pinMessageApi,
  removeChatMember as removeChatMemberApi,
  sendMessage as sendMessageApi,
  setChatAdmin as setChatAdminApi,
  setChatArchived as setChatArchivedApi,
  setChatAvatar as setChatAvatarApi,
  setChatTitle as setChatTitleApi,
  setMemberPinned as setMemberPinnedApi,
  softDeleteMessage as softDeleteMessageApi,
  subscribeMessenger,
  uploadMessengerFile,
} from "../api/messenger-api";
import { countUnreadChats, sortMessengerChats } from "../lib/sort-chats";
import type {
  MessengerChat,
  MessengerDraft,
  MessengerMember,
  MessengerMessage,
} from "../model/types";

export type MessengerStatus = "idle" | "loading" | "ready" | "error";

type Listener = () => void;

const SOUND_KEY = "messenger.soundEnabled";

let authUserId: string | null = null;
let chats: MessengerChat[] = [];
let status: MessengerStatus = "idle";
let errorMessage: string | null = null;
let panelOpen = false;
let activeChatId: string | null = null;
let showArchived = false;
const messagesByChat = new Map<string, MessengerMessage[]>();
const hasMoreByChat = new Map<string, boolean>();
const membersByChat = new Map<string, MessengerMember[]>();
const drafts = new Map<string, MessengerDraft>();
let messagesStatus: MessengerStatus = "idle";
let unsubscribeRealtime: (() => void) | null = null;
let reloadTimer: number | null = null;
let soundEnabled =
  typeof localStorage !== "undefined"
    ? localStorage.getItem(SOUND_KEY) === "1"
    : false;

const listeners = new Set<Listener>();

/** Stable empties for useSyncExternalStore getSnapshot (Object.is). */
const EMPTY_MESSAGES: MessengerMessage[] = [];
const EMPTY_MEMBERS: MessengerMember[] = [];
const EMPTY_DRAFT: MessengerDraft = { text: "", replyToId: null };

function notify() {
  listeners.forEach((listener) => listener());
}

function emptyDraft(): MessengerDraft {
  return { text: "", replyToId: null };
}

export function subscribeMessengerStore(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMessengerStatus() {
  return status;
}

export function getMessengerError() {
  return errorMessage;
}

export function getMessengerChats() {
  return chats;
}

export function getMessengerPanelOpen() {
  return panelOpen;
}

export function getActiveMessengerChatId() {
  return activeChatId;
}

export function getShowArchivedChats() {
  return showArchived;
}

export function getMessengerMessagesStatus() {
  return messagesStatus;
}

export function getMessengerMessages(chatId: string | null) {
  if (!chatId) return EMPTY_MESSAGES;
  return messagesByChat.get(chatId) ?? EMPTY_MESSAGES;
}

export function getMessengerHasMore(chatId: string | null) {
  if (!chatId) return false;
  return hasMoreByChat.get(chatId) ?? false;
}

export function getMessengerMembers(chatId: string | null) {
  if (!chatId) return EMPTY_MEMBERS;
  return membersByChat.get(chatId) ?? EMPTY_MEMBERS;
}

export function getMessengerDraft(chatId: string | null): MessengerDraft {
  if (!chatId) return EMPTY_DRAFT;
  return drafts.get(chatId) ?? EMPTY_DRAFT;
}

export function getUnreadMessengerChatCount() {
  return countUnreadChats(chats.filter((c) => c.status === "active"));
}

export function getMessengerSoundEnabled() {
  return soundEnabled;
}

export function setMessengerSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
  try {
    localStorage.setItem(SOUND_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
  notify();
}

export function setMessengerAuthUserId(userId: string | null) {
  authUserId = userId;
}

export function openMessengerPanel(chatId?: string | null) {
  panelOpen = true;
  if (chatId) activeChatId = chatId;
  notify();
}

export function closeMessengerPanel() {
  panelOpen = false;
  notify();
}

export function toggleMessengerPanel() {
  panelOpen = !panelOpen;
  notify();
}

export function setShowArchivedChats(value: boolean) {
  showArchived = value;
  notify();
}

export function setMessengerDraft(
  chatId: string,
  patch: Partial<MessengerDraft>,
) {
  const current = drafts.get(chatId) ?? emptyDraft();
  drafts.set(chatId, { ...current, ...patch });
  notify();
}

function playIncomingSound() {
  if (!soundEnabled || typeof window === "undefined") return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    window.setTimeout(() => void ctx.close(), 300);
  } catch {
    // ignore
  }
}

function scheduleReload() {
  if (reloadTimer != null) window.clearTimeout(reloadTimer);
  reloadTimer = window.setTimeout(() => {
    reloadTimer = null;
    void reloadMessengerChats();
    if (activeChatId) {
      void reloadActiveMessages({ silent: true });
      void reloadActiveMembers();
    }
  }, 250);
}

export async function reloadMessengerChats() {
  if (!authUserId || !isSupabaseConfigured) {
    chats = [];
    status = "ready";
    notify();
    return;
  }
  try {
    status = status === "idle" ? "loading" : status;
    notify();
    const next = await fetchMessengerChats(authUserId);
    const prevUnread = countUnreadChats(chats);
    chats = sortMessengerChats(next);
    status = "ready";
    errorMessage = null;
    const nextUnread = countUnreadChats(chats);
    if (nextUnread > prevUnread && panelOpen === false) {
      playIncomingSound();
    }
    notify();
  } catch (error: unknown) {
    console.error("[messenger] load chats failed", error);
    status = "error";
    errorMessage =
      error instanceof Error ? error.message : "Не удалось загрузить чаты";
    notify();
  }
}

export async function selectMessengerChat(chatId: string | null) {
  activeChatId = chatId;
  notify();
  if (!chatId) return;
  await Promise.all([
    reloadActiveMessages(),
    reloadActiveMembers(),
    markActiveChatRead(),
  ]);
}

async function reloadActiveMembers() {
  if (!activeChatId) return;
  try {
    const members = await fetchChatMembers(activeChatId);
    membersByChat.set(activeChatId, members);
    notify();
  } catch (error: unknown) {
    console.error("[messenger] load members failed", error);
  }
}

async function reloadActiveMessages(options?: { silent?: boolean }) {
  if (!activeChatId) return;
  if (!options?.silent) {
    messagesStatus = "loading";
    notify();
  }
  try {
    const page = await fetchMessagesPage(activeChatId, { limit: 40 });
    messagesByChat.set(activeChatId, page.messages);
    hasMoreByChat.set(activeChatId, page.hasMore);
    messagesStatus = "ready";
    notify();
  } catch (error: unknown) {
    console.error("[messenger] load messages failed", error);
    messagesStatus = "error";
    errorMessage =
      error instanceof Error ? error.message : "Не удалось загрузить сообщения";
    notify();
  }
}

export async function loadOlderMessengerMessages() {
  if (!activeChatId) return;
  const current = messagesByChat.get(activeChatId) ?? [];
  if (current.length === 0 || !hasMoreByChat.get(activeChatId)) return;
  const before = current[0]?.createdAt;
  try {
    const page = await fetchMessagesPage(activeChatId, {
      before,
      limit: 40,
    });
    messagesByChat.set(activeChatId, [...page.messages, ...current]);
    hasMoreByChat.set(activeChatId, page.hasMore);
    notify();
  } catch (error: unknown) {
    console.error("[messenger] load older messages failed", error);
  }
}

export async function markActiveChatRead() {
  if (!activeChatId || !authUserId) return;
  try {
    await markChatReadApi(activeChatId);
    chats = chats.map((chat) =>
      chat.id === activeChatId
        ? {
            ...chat,
            unreadCount: 0,
            myLastReadAt: new Date().toISOString(),
          }
        : chat,
    );
    notify();
  } catch (error: unknown) {
    console.error("[messenger] mark read failed", error);
  }
}

export function startMessengerRealtime() {
  stopMessengerRealtime();
  if (!authUserId || !isSupabaseConfigured) return;
  unsubscribeRealtime = subscribeMessenger(() => {
    scheduleReload();
  });
}

export function stopMessengerRealtime() {
  unsubscribeRealtime?.();
  unsubscribeRealtime = null;
  if (reloadTimer != null) {
    window.clearTimeout(reloadTimer);
    reloadTimer = null;
  }
}

export async function openOrCreateDirectChat(otherUserId: string) {
  const chatId = await getOrCreateDirectChat(otherUserId);
  panelOpen = true;
  await reloadMessengerChats();
  await selectMessengerChat(chatId);
  return chatId;
}

export async function createMessengerGroup(input: {
  title: string;
  memberIds: string[];
  entityId?: string | null;
  recordId?: string | null;
  entityTitle?: string | null;
}) {
  const chatId = await createGroupChatApi(input);
  panelOpen = true;
  await reloadMessengerChats();
  await selectMessengerChat(chatId);
  return chatId;
}

export async function openOrCreateCrmChat(input: {
  entityId: string;
  recordId: string;
  entityTitle: string;
  memberIds: string[];
}) {
  const existing = await findChatForRecord(input.entityId, input.recordId);
  if (existing) {
    panelOpen = true;
    await reloadMessengerChats();
    await selectMessengerChat(existing);
    return existing;
  }
  return createMessengerGroup({
    title: input.entityTitle,
    memberIds: input.memberIds,
    entityId: input.entityId,
    recordId: input.recordId,
    entityTitle: input.entityTitle,
  });
}

export async function sendMessengerMessage(input: {
  chatId: string;
  body: string;
  files?: File[];
}) {
  const draft = drafts.get(input.chatId) ?? emptyDraft();
  await sendMessageApi({
    chatId: input.chatId,
    body: input.body,
    replyToId: draft.replyToId,
    files: input.files,
  });
  drafts.set(input.chatId, emptyDraft());
  await reloadActiveMessages({ silent: true });
  await reloadMessengerChats();
  await markActiveChatRead();
}

export async function editMessengerMessage(messageId: string, body: string) {
  await editMessageApi(messageId, body);
  await reloadActiveMessages({ silent: true });
}

export async function deleteMessengerMessage(messageId: string) {
  await softDeleteMessageApi(messageId);
  await reloadActiveMessages({ silent: true });
  await reloadMessengerChats();
}

export async function addMessengerMembers(chatId: string, memberIds: string[]) {
  await addChatMembersApi(chatId, memberIds);
  await reloadActiveMembers();
  await reloadMessengerChats();
}

export async function removeMessengerMember(chatId: string, userId: string) {
  await removeChatMemberApi(chatId, userId);
  await reloadActiveMembers();
  await reloadMessengerChats();
}

export async function leaveMessengerChat(
  chatId: string,
  newAdminId?: string | null,
) {
  await leaveChatApi(chatId, newAdminId);
  if (activeChatId === chatId) activeChatId = null;
  await reloadMessengerChats();
  notify();
}

export async function renameMessengerChat(chatId: string, title: string) {
  await setChatTitleApi(chatId, title);
  await reloadMessengerChats();
}

export async function archiveMessengerChat(chatId: string, archived: boolean) {
  await setChatArchivedApi(chatId, archived);
  await reloadMessengerChats();
}

export async function pinMessengerChat(chatId: string, pinned: boolean) {
  await setMemberPinnedApi(chatId, pinned);
  await reloadMessengerChats();
}

export async function pinMessengerMessage(
  chatId: string,
  messageId: string | null,
) {
  await pinMessageApi(chatId, messageId);
  await reloadMessengerChats();
}

export async function bindMessengerEntity(
  chatId: string,
  entityId: string,
  recordId: string,
  entityTitle?: string | null,
) {
  await bindChatEntityApi(chatId, entityId, recordId, entityTitle);
  await reloadMessengerChats();
}

export async function setMessengerAdmin(
  chatId: string,
  userId: string,
  isAdmin: boolean,
) {
  await setChatAdminApi(chatId, userId, isAdmin);
  await reloadActiveMembers();
}

export async function uploadMessengerAvatar(chatId: string, file: File) {
  const meta = await uploadMessengerFile(chatId, file);
  await setChatAvatarApi(chatId, meta.storage_path);
  await reloadMessengerChats();
}
