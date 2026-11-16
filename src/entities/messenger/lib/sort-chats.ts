import type { MessengerChat } from "../model/types";

export function sortMessengerChats(chats: MessengerChat[]): MessengerChat[] {
  return [...chats].sort((a, b) => {
    if (a.myIsPinned !== b.myIsPinned) return a.myIsPinned ? -1 : 1;
    const aTime = a.lastMessageAt ?? a.createdAt;
    const bTime = b.lastMessageAt ?? b.createdAt;
    return bTime.localeCompare(aTime);
  });
}

export function filterMessengerChats(
  chats: MessengerChat[],
  query: string,
  resolveMemberName: (userId: string) => string,
): MessengerChat[] {
  const q = query.trim().toLocaleLowerCase("ru");
  if (!q) return chats;
  return chats.filter((chat) => {
    if (chat.title.toLocaleLowerCase("ru").includes(q)) return true;
    if ((chat.entityTitle ?? "").toLocaleLowerCase("ru").includes(q)) {
      return true;
    }
    if ((chat.lastMessagePreview ?? "").toLocaleLowerCase("ru").includes(q)) {
      return true;
    }
    return chat.memberIds.some((id) =>
      resolveMemberName(id).toLocaleLowerCase("ru").includes(q),
    );
  });
}

export function countUnreadChats(chats: MessengerChat[]): number {
  return chats.filter(
    (chat) => chat.status === "active" && chat.unreadCount > 0,
  ).length;
}
