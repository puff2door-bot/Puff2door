import React, { useEffect, useMemo, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import api from "../api";
import { useToast } from "../hooks/use-toast";

const toApplicationServerKey = (value) => {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = window.atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
};

const NotificationOptIn = () => {
  const { toast } = useToast();
  const [config, setConfig] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [busy, setBusy] = useState(false);
  const supported = useMemo(() => "Notification" in window && "serviceWorker" in navigator && "PushManager" in window, []);
  const iosBrowser = useMemo(() => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone, []);

  useEffect(() => {
    let active = true;
    api.get("/push/config").then(async ({ data }) => {
      if (!active) return;
      setConfig(data);
      if (data.enabled && supported) {
        const registration = await navigator.serviceWorker.ready;
        const current = await registration.pushManager.getSubscription();
        if (active) setSubscription(current);
      }
    }).catch(() => active && setConfig({ enabled: false }));
    return () => { active = false; };
  }, [supported]);

  if (!config?.enabled) return null;

  const enable = async () => {
    if (!supported || iosBrowser) {
      toast({ title: "Install the HD Smoke Shop app first", description: "On iPhone, add HD Smoke Shop to your Home Screen, open it there, then enable order alerts.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notification permission was not allowed in this browser.");
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();
      const next = current || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toApplicationServerKey(config.publicKey) });
      await api.post("/push/subscribe", next.toJSON());
      setSubscription(next);
      toast({ title: "Order alerts enabled", description: "This device will receive updates when your order status changes." });
    } catch (error) {
      toast({ title: "Could not enable order alerts", description: error?.response?.data?.detail || error.message || "Please try again.", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const disable = async () => {
    if (!subscription) return;
    setBusy(true);
    try {
      await api.delete("/push/subscription", { data: subscription.toJSON() });
      await subscription.unsubscribe();
      setSubscription(null);
      toast({ title: "Order alerts disabled", description: "This device will no longer receive order notifications." });
    } catch (error) {
      toast({ title: "Could not disable alerts", description: error?.response?.data?.detail || "Please try again.", variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <section className="mt-6 border-t border-neutral-200 pt-5 text-left" data-testid="notification-settings">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Bell className="h-5 w-5" /></span>
        <div>
          <h2 className="text-sm font-bold text-neutral-900">Order alerts on this device</h2>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500">Get a browser notification when your signed-in order is prepared, on the way, or delivered.</p>
        </div>
      </div>
      <button type="button" disabled={busy} onClick={subscription ? disable : enable} className={`mt-4 flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold disabled:opacity-60 ${subscription ? "border border-neutral-300 text-neutral-700 hover:border-red-300 hover:text-red-700" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : subscription ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {busy ? "Updating…" : subscription ? "Disable alerts" : "Enable order alerts"}
      </button>
    </section>
  );
};

export default NotificationOptIn;
