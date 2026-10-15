import React, { useEffect, useMemo, useState } from "react";
import { Bell, Download, Share, Smartphone, X } from "lucide-react";

const DISMISSED_KEY = "p2d_install_dismissed_at";
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

const PwaExperience = () => {
  const [installEvent, setInstallEvent] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showIos, setShowIos] = useState(false);
  const [notificationState, setNotificationState] = useState(() => ("Notification" in window ? Notification.permission : "unsupported"));
  const ios = useMemo(() => /iphone|ipad|ipod/i.test(navigator.userAgent), []);
  const preview = useMemo(() => new URLSearchParams(window.location.search).get("preview") === "pwa", []);

  useEffect(() => {
    if (isStandalone()) return undefined;
    const dismissed = Number(localStorage.getItem(DISMISSED_KEY) || 0);
    const mayShow = Date.now() - dismissed > 7 * 24 * 60 * 60 * 1000;
    const onPrompt = (event) => {
      event.preventDefault();
      setInstallEvent(event);
      if (mayShow) setShowInstall(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const timer = window.setTimeout(() => {
      if ((ios || preview) && mayShow) setShowInstall(true);
    }, 1800);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.clearTimeout(timer); };
  }, [ios, preview]);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setShowInstall(false);
  };

  const install = async () => {
    if (ios || (preview && !installEvent)) { setShowIos(true); return; }
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
    setShowInstall(false);
  };

  const enableNotifications = async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    const permission = await Notification.requestPermission();
    setNotificationState(permission);
    if (permission === "granted") {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("Puff2Door notifications are on", {
        body: "You can receive order updates on this device. Promotion delivery will appear after messaging is connected.",
        icon: "/icon-192.png", badge: "/icon-96.png", tag: "p2d-notification-test", data: { url: "/my-account" },
      });
      localStorage.setItem("p2d_notifications_enabled", "true");
    }
  };

  if (!showInstall && notificationState !== "default") return null;

  return (
    <>
      {showInstall && (
        <aside data-testid="pwa-install-banner" className="fixed z-[80] left-3 right-3 bottom-20 sm:left-auto sm:right-5 sm:bottom-5 sm:w-[390px] rounded-2xl bg-neutral-950 text-white shadow-2xl border border-white/10 p-4">
          <button onClick={dismiss} aria-label="Dismiss app install" className="absolute right-3 top-3 p-1 text-neutral-400 hover:text-white"><X className="h-4 w-4" /></button>
          <div className="flex gap-3 pr-6"><img src="/icon-96.png" alt="" className="h-14 w-14 rounded-xl" /><div><p className="font-heading text-xl uppercase tracking-wide">Install Puff2Door</p><p className="text-xs text-neutral-300 mt-1">Faster access, a home-screen icon, saved cart, and order alerts.</p></div></div>
          <button onClick={install} data-testid="pwa-install-button" className="mt-4 w-full rounded-full bg-emerald-600 py-2.5 text-sm font-bold hover:bg-emerald-500 flex items-center justify-center gap-2"><Download className="h-4 w-4" /> {ios ? "How to install on iPhone" : "Install our app"}</button>
        </aside>
      )}
      {!showInstall && notificationState === "default" && (
        <button onClick={enableNotifications} data-testid="notification-opt-in" className="fixed z-[70] left-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] rounded-full bg-neutral-950 text-white shadow-xl px-4 py-3 text-sm font-bold flex items-center gap-2 hover:bg-emerald-700"><Bell className="h-4 w-4" /> Enable order alerts</button>
      )}
      {showIos && (
        <div className="fixed inset-0 z-[100] bg-black/60 grid place-items-end sm:place-items-center p-3" role="dialog" aria-modal="true" aria-labelledby="ios-install-title">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex justify-between gap-4"><div className="flex items-center gap-2"><Smartphone className="text-emerald-600"/><h2 id="ios-install-title" className="font-heading text-2xl uppercase">Add to Home Screen</h2></div><button onClick={()=>setShowIos(false)} aria-label="Close"><X /></button></div>
            <ol className="mt-5 space-y-4 text-sm text-neutral-700">
              <li className="flex gap-3"><span className="font-bold text-emerald-700">1.</span><span>In Safari, tap the <b>Share</b> button <Share className="inline h-4 w-4"/> at the bottom of the screen.</span></li>
              <li className="flex gap-3"><span className="font-bold text-emerald-700">2.</span><span>Scroll down and tap <b>Add to Home Screen</b>.</span></li>
              <li className="flex gap-3"><span className="font-bold text-emerald-700">3.</span><span>Tap <b>Add</b>, then open Puff2Door from your Home Screen.</span></li>
            </ol>
            <button onClick={()=>setShowIos(false)} className="mt-6 w-full rounded-full bg-neutral-900 text-white py-3 font-bold">Got it</button>
          </div>
        </div>
      )}
    </>
  );
};

export default PwaExperience;
