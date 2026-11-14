import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useApp } from "../context/AppContext";

// Admin > Visitors: one tiny background ping per page view (after the page has loaded), plus one per
// add-to-cart. Area only; no cookie. Never sent from a device that has logged into Admin, or from Admin pages.
const skip = () => {
  try { return localStorage.getItem("p2d_no_track") === "1"; } catch { return false; }
};
const sessionId = () => {
  try {
    let id = sessionStorage.getItem("p2d_vsid");
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.random()}`).replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);
      sessionStorage.setItem("p2d_vsid", id);
    }
    return id;
  } catch { return ""; }
};
const send = (body) => {
  if (skip()) return;
  const sid = sessionId();
  if (!sid) return;
  const payload = JSON.stringify({ sid, ...body });
  try {
    if (navigator.sendBeacon && navigator.sendBeacon("/api/visit", new Blob([payload], { type: "application/json" }))) return;
  } catch { /* fall through */ }
  fetch("/api/visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true, credentials: "same-origin" }).catch(() => {});
};
const afterLoad = (fn) => {
  if (document.readyState === "complete") setTimeout(fn, 800);
  else window.addEventListener("load", () => setTimeout(fn, 800), { once: true });
};

const VisitTracker = () => {
  const { pathname } = useLocation();
  const { user, authLoading } = useApp();
  const first = useRef(true);
  const utm = useRef((() => { const q = new URLSearchParams(window.location.search); return [q.get("utm_source"), q.get("utm_campaign")].filter(Boolean).join("|").slice(0, 60); })());

  useEffect(() => {
    if (authLoading || (user && user.role === "admin")) return;
    if (pathname.startsWith("/admin") || pathname.startsWith("/driver")) return;
    const ref = first.current ? document.referrer : "";
    const u = first.current ? utm.current : "";
    first.current = false;
    afterLoad(() => send({ path: pathname, ref, utm: u, event: "view" }));
  }, [pathname, authLoading, user]);

  useEffect(() => {
    const onAdd = (e) => send({ path: window.location.pathname, event: "cart", product: (e.detail && e.detail.slug) || "" });
    window.addEventListener("p2d-cart-add", onAdd);
    return () => window.removeEventListener("p2d-cart-add", onAdd);
  }, []);
  return null;
};

export default VisitTracker;
