import { useEffect } from "react";
import { toast } from "sonner";
import { findSystemUserByAuthId, useEntityConfig } from "@/entities/entity";
import {
  formatNotificationCopy,
  loadNotificationInbox,
  setNotificationToastHandler,
  startNotificationRealtime,
  stopNotificationRealtime,
  type Notification,
} from "@/entities/notification";
import { useSessionUser } from "@/entities/session";
import { Toaster } from "@/shared/ui/sonner";

/** Bootstraps inbox realtime + toast host for the signed-in user. */
export function NotificationsHost() {
  const sessionUser = useSessionUser();
  const { entities } = useEntityConfig();

  useEffect(() => {
    setNotificationToastHandler((notification: Notification) => {
      const copy = formatNotificationCopy({
        title: notification.title,
        message: notification.message,
        entityId: notification.entityId,
        recordId: notification.recordId,
        entities,
      });
      toast(copy.title || "Уведомление", {
        description: copy.message || undefined,
        duration: 6000,
      });
    });
    return () => setNotificationToastHandler(null);
  }, [entities]);

  useEffect(() => {
    if (!sessionUser) {
      stopNotificationRealtime();
      return;
    }
    const profile = findSystemUserByAuthId(entities, sessionUser.id);
    const userIds = [sessionUser.id];
    if (profile?.id && profile.id !== sessionUser.id) {
      userIds.push(profile.id);
    }
    void loadNotificationInbox(userIds);
    startNotificationRealtime();
    return () => stopNotificationRealtime();
  }, [sessionUser, entities]);

  return <Toaster />;
}
