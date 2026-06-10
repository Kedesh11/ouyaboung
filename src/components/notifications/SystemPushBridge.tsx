"use client";

import { useEffect, useMemo, useRef } from "react";
import { supabaseClient } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  data?: Record<string, unknown> | null;
};

const PROMPT_STORAGE_KEY = "ouyaboung.push.permission.prompted.v1";

const getDefaultNotificationsRoute = (role: string | null): string => {
  if (role === "admin") return "/admin/notifications";
  if (role === "merchant") return "/merchant/notifications";
  return "/user/notifications";
};

const extractActionUrl = (
  payloadData: Record<string, unknown> | null | undefined,
  fallbackUrl: string
): string => {
  if (payloadData && typeof payloadData.action_url === "string" && payloadData.action_url.trim().length > 0) {
    return payloadData.action_url;
  }
  return fallbackUrl;
};

export function SystemPushBridge() {
  const { user, loading, isAuthenticated, userRole } = useAuth();
  const shownNotificationIdsRef = useRef<Set<string>>(new Set());
  const pushEnabledRef = useRef(true);
  const fallbackRoute = useMemo(() => getDefaultNotificationsRoute(userRole), [userRole]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (loading || !isAuthenticated || !user || !supabaseClient) return;
    if (!("Notification" in window)) return;

    const alreadyPrompted = localStorage.getItem(PROMPT_STORAGE_KEY) === "1";

    if (Notification.permission !== "default" || alreadyPrompted) return;

    const requestPermissionFromGesture = () => {
      localStorage.setItem(PROMPT_STORAGE_KEY, "1");
      void Notification.requestPermission();
      window.removeEventListener("click", requestPermissionFromGesture);
      window.removeEventListener("keydown", requestPermissionFromGesture);
      window.removeEventListener("touchstart", requestPermissionFromGesture);
    };

    window.addEventListener("click", requestPermissionFromGesture, { once: true });
    window.addEventListener("keydown", requestPermissionFromGesture, { once: true });
    window.addEventListener("touchstart", requestPermissionFromGesture, { once: true });

    return () => {
      window.removeEventListener("click", requestPermissionFromGesture);
      window.removeEventListener("keydown", requestPermissionFromGesture);
      window.removeEventListener("touchstart", requestPermissionFromGesture);
    };
  }, [loading, isAuthenticated, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (loading || !isAuthenticated || !user || !supabaseClient) return;
    const client = supabaseClient;

    let active = true;

    const showSystemNotification = async (row: NotificationRow) => {
      if (!active) return;
      if (!pushEnabledRef.current) return;
      if (!("Notification" in window) || Notification.permission !== "granted") return;

      const actionUrl = extractActionUrl(row.data, fallbackRoute);
      const options: NotificationOptions = {
        body: row.message,
        icon: "/icons/icon-192x192.png",
        badge: "/icons/icon-192x192.png",
        tag: `notif-${row.id}`,
        data: {
          id: row.id,
          url: actionUrl,
        },
      };

      try {
        if ("serviceWorker" in navigator) {
          const registration = await navigator.serviceWorker.ready;
          await registration.showNotification(row.title, options);
          return;
        }
      } catch (error) {
        console.warn("[SystemPushBridge] Service worker notification failed, fallback to Notification API", error);
      }

      const notification = new Notification(row.title, options);
      notification.onclick = () => {
        const targetUrl = typeof options.data?.url === "string" ? options.data.url : fallbackRoute;
        window.focus();
        window.location.href = targetUrl;
        notification.close();
      };
    };

    const loadPushPreference = async () => {
      const { data, error } = await client
        .from("profiles")
        .select("preferences")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) return;

      const preferences = (data?.preferences || {}) as {
        notification_preferences?: { push_enabled?: boolean };
      };
      pushEnabledRef.current = preferences.notification_preferences?.push_enabled !== false;
    };

    void loadPushPreference();

    const channel = client
      .channel(`push-notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const notification = payload.new as NotificationRow;
          if (!notification?.id) return;

          if (shownNotificationIdsRef.current.has(notification.id)) {
            return;
          }
          shownNotificationIdsRef.current.add(notification.id);
          void showSystemNotification(notification);
        }
      )
      .subscribe();

    return () => {
      active = false;
      client.removeChannel(channel);
    };
  }, [loading, isAuthenticated, user, fallbackRoute]);

  return null;
}
