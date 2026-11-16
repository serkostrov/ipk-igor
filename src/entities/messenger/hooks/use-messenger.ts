import { useSyncExternalStore } from "react";
import {
  getActiveMessengerChatId,
  getMessengerChats,
  getMessengerDraft,
  getMessengerError,
  getMessengerHasMore,
  getMessengerMembers,
  getMessengerMessages,
  getMessengerMessagesStatus,
  getMessengerPanelOpen,
  getMessengerSoundEnabled,
  getMessengerStatus,
  getShowArchivedChats,
  getUnreadMessengerChatCount,
  subscribeMessengerStore,
} from "../store/messenger-store";

export function useMessengerStatus() {
  return useSyncExternalStore(
    subscribeMessengerStore,
    getMessengerStatus,
    getMessengerStatus,
  );
}

export function useMessengerError() {
  return useSyncExternalStore(
    subscribeMessengerStore,
    getMessengerError,
    getMessengerError,
  );
}

export function useMessengerChats() {
  return useSyncExternalStore(
    subscribeMessengerStore,
    getMessengerChats,
    getMessengerChats,
  );
}

export function useMessengerPanelOpen() {
  return useSyncExternalStore(
    subscribeMessengerStore,
    getMessengerPanelOpen,
    getMessengerPanelOpen,
  );
}

export function useActiveMessengerChatId() {
  return useSyncExternalStore(
    subscribeMessengerStore,
    getActiveMessengerChatId,
    getActiveMessengerChatId,
  );
}

export function useShowArchivedChats() {
  return useSyncExternalStore(
    subscribeMessengerStore,
    getShowArchivedChats,
    getShowArchivedChats,
  );
}

export function useMessengerMessages() {
  const chatId = useActiveMessengerChatId();
  return useSyncExternalStore(
    subscribeMessengerStore,
    () => getMessengerMessages(chatId),
    () => getMessengerMessages(chatId),
  );
}

export function useMessengerHasMore() {
  const chatId = useActiveMessengerChatId();
  return useSyncExternalStore(
    subscribeMessengerStore,
    () => getMessengerHasMore(chatId),
    () => getMessengerHasMore(chatId),
  );
}

export function useMessengerMembers() {
  const chatId = useActiveMessengerChatId();
  return useSyncExternalStore(
    subscribeMessengerStore,
    () => getMessengerMembers(chatId),
    () => getMessengerMembers(chatId),
  );
}

export function useMessengerDraft() {
  const chatId = useActiveMessengerChatId();
  return useSyncExternalStore(
    subscribeMessengerStore,
    () => getMessengerDraft(chatId),
    () => getMessengerDraft(chatId),
  );
}

export function useMessengerMessagesStatus() {
  return useSyncExternalStore(
    subscribeMessengerStore,
    getMessengerMessagesStatus,
    getMessengerMessagesStatus,
  );
}

export function useUnreadMessengerChatCount() {
  return useSyncExternalStore(
    subscribeMessengerStore,
    getUnreadMessengerChatCount,
    getUnreadMessengerChatCount,
  );
}

export function useMessengerSoundEnabled() {
  return useSyncExternalStore(
    subscribeMessengerStore,
    getMessengerSoundEnabled,
    getMessengerSoundEnabled,
  );
}
