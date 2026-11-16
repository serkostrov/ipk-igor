import { useEffect } from "react";
import {
  reloadMessengerChats,
  setMessengerAuthUserId,
  startMessengerRealtime,
  stopMessengerRealtime,
} from "@/entities/messenger";
import { useSessionUser } from "@/entities/session";

/** Bootstraps messenger chats + realtime for the signed-in user. */
export function MessengerHost() {
  const sessionUser = useSessionUser();

  useEffect(() => {
    const userId = sessionUser?.id ?? null;
    setMessengerAuthUserId(userId);
    if (!userId) {
      stopMessengerRealtime();
      return;
    }
    void reloadMessengerChats();
    startMessengerRealtime();
    return () => stopMessengerRealtime();
  }, [sessionUser?.id]);

  return null;
}
