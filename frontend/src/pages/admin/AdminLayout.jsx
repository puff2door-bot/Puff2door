import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Link, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, Package, ShoppingBag, Bell, ArrowLeft, ShieldAlert, Images, Mail, Ticket, Settings, Tag, FolderTree, Gift, MessageCircle, Truck, ShieldCheck, BarChart3, Store, Camera, Bot, Barcode, Receipt, Wallet, FileText, UserRound, Sparkles, ClipboardList, Star, PackageSearch, ScanLine, Smartphone, Menu, Search, X, Home, MapPinned } from "lucide-react";
import { useApp } from "../../context/AppContext";
import api from "../../api";

const nav = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/agents", label: "Agents", icon: Bot },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/inventory-capture", label: "Store Photos", icon: Images },
  { to: "/admin/missing-photos", label: "Missing Photos", icon: Camera },
  { to: "/admin/missing-barcodes", label: "Missing Barcodes", icon: Barcode },
  { to: "/admin/product-details", label: "Product Details", icon: Sparkles },
  { to: "/admin/missing-details", label: "Missing Details", icon: ClipboardList },
  { to: "/admin/reviews", label: "Reviews", icon: Star },
  { to: "/admin/receipts", label: "Store Receipts", icon: Receipt },
  { to: "/admin/expenses", label: "Business Expenses", icon: Wallet },
  { to: "/admin/documents", label: "Licenses & Docs", icon: FileText },
  { to: "/admin/customers", label: "Customers", icon: UserRound },
  { to: "/admin/clover", label: "Clover Inventory", icon: Store },
  { to: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { to: "/admin/picking", label: "Picking & Barcode", icon: ScanLine },
  { to: "/driver-app", label: "Driver App", icon: Smartphone },
  { to: "/admin/product-requests", label: "Product Requests", icon: PackageSearch },
  { to: "/admin/operations", label: "Delivery Operations", icon: Truck },
  { to: "/admin/compliance", label: "Compliance", icon: ShieldCheck },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/admin/visitors", label: "Visitors", icon: MapPinned },
  { to: "/admin/chat", label: "Live Chat", icon: MessageCircle, badge: "chat" },
  { to: "/admin/loyalty", label: "Loyalty Rewards", icon: Gift },
  { to: "/admin/alerts", label: "Restock Alerts", icon: Bell },
  { to: "/admin/banners", label: "Home Banners", icon: Images },
  { to: "/admin/brands", label: "Brands", icon: Tag },
  { to: "/admin/categories", label: "Categories", icon: FolderTree },
  { to: "/admin/promos", label: "Promo Codes", icon: Ticket },
  { to: "/admin/emails", label: "Email Log", icon: Mail },
  { to: "/admin/settings", label: "Store Settings", icon: Settings },
];

// Phones: the same pages, grouped for the "More" sheet (the laptop sidebar keeps its own order above).
const GROUPS = [
  ["Orders & delivery", ["/admin/orders", "/admin/picking", "/admin/operations", "/driver-app", "/admin/alerts", "/admin/product-requests"]],
  ["Products", ["/admin/products", "/admin/clover", "/admin/inventory-capture", "/admin/missing-photos", "/admin/missing-barcodes", "/admin/missing-details", "/admin/product-details", "/admin/categories", "/admin/brands"]],
  ["Marketing", ["/admin/banners", "/admin/promos", "/admin/loyalty", "/admin/reviews", "/admin/agents", "/admin/emails"]],
  ["Customers & numbers", ["/admin/customers", "/admin/visitors", "/admin/analytics", "/admin/chat"]],
  ["Money & paperwork", ["/admin/receipts", "/admin/expenses", "/admin/documents", "/admin/compliance"]],
  ["Settings", ["/admin/settings", "/admin"]],
];
const navByPath = Object.fromEntries(nav.map((n) => [n.to, n]));
// Extra words so "Jump to" finds a page by what you're looking for, not just its name.
const KEYWORDS = {
  "/admin/picking": "pick scan barcode packing", "/admin/missing-barcodes": "barcode upc scan", "/admin/promos": "coupon discount code",
  "/admin/banners": "hero slider homepage", "/admin/settings": "tax delivery fee sal mascot hours zip", "/admin/operations": "driver delivery windows cutoff",
  "/admin/clover": "pos inventory stock sync", "/admin/expenses": "money bills spending", "/admin/receipts": "sales clover daily", "/admin/documents": "license permit tobacco",
  "/admin/agents": "instagram automation google review emails", "/admin/loyalty": "points rewards", "/admin/inventory-capture": "photos camera", "/admin/customers": "regulars people", "/admin/visitors": "traffic city area location where clicks people zip",
};
const TABS = [
  { to: "/admin", label: "Home", icon: Home, end: true },
  { to: "/admin/orders", label: "Orders", icon: ShoppingBag, badge: "pick" },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/chat", label: "Chat", icon: MessageCircle, badge: "chat" },
];

const Count = ({ n, className = "" }) => (n > 0 ? <span className={`min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center leading-none ${className}`}>{n > 99 ? "99+" : n}</span> : null);

const MoreSheet = ({ open, onClose, counts }) => {
  const [q, setQ] = useState("");
  const input = useRef(null);
  useEffect(() => { if (open) { setQ(""); } }, [open]);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return null;
    return nav.filter((n) => `${n.label} ${KEYWORDS[n.to] || ""}`.toLowerCase().includes(t));
  }, [q]);
  if (!open) return null;
  const Tile = ({ n }) => (
    <Link to={n.to} onClick={onClose} className="relative flex flex-col items-center justify-center gap-1.5 rounded-xl border border-neutral-100 bg-neutral-50 px-1.5 py-3 text-center text-[11.5px] font-semibold leading-tight text-neutral-800 active:bg-neutral-100">
      <n.icon className="h-5 w-5 text-emerald-700" aria-hidden="true" />{n.label}
      {n.badge === "chat" && <Count n={counts.chat} className="absolute top-1.5 right-1.5" />}
      {n.to === "/admin/orders" && <Count n={counts.pick} className="absolute top-1.5 right-1.5" />}
    </Link>
  );
  return (
    <div className="lg:hidden fixed inset-0 z-[80] bg-black/40 flex items-end" onClick={onClose} data-testid="admin-more-sheet">
      <div className="w-full max-h-[88vh] overflow-y-auto rounded-t-3xl bg-white px-4 pt-2 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="All admin pages">
        <div className="sticky top-0 bg-white pt-1 pb-2 z-10">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-neutral-300" />
          <div className="flex items-center gap-2">
            <label className="flex flex-1 items-center gap-2 rounded-xl bg-neutral-100 px-3 py-2.5">
              <Search className="h-4 w-4 text-neutral-400" aria-hidden="true" />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder='Jump to… (try "barcode")' className="w-full bg-transparent text-sm outline-none" data-testid="admin-jump" />
            </label>
            <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl bg-neutral-100" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
        </div>
        {results ? (
          results.length ? <div className="grid grid-cols-3 gap-2 pt-2">{results.map((n) => <Tile key={n.to} n={n} />)}</div>
            : <p className="py-8 text-center text-sm text-neutral-500">No admin page matches "{q}".</p>
        ) : GROUPS.map(([title, paths]) => (
          <div key={title}>
            <p className="mt-4 mb-2 px-0.5 text-[11px] font-extrabold uppercase tracking-[0.15em] text-neutral-400">{title}</p>
            <div className="grid grid-cols-3 gap-2">{paths.map((p) => navByPath[p] && <Tile key={p} n={navByPath[p]} />)}</div>
          </div>
        ))}
        <Link to="/" onClick={onClose} className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700"><ArrowLeft className="h-4 w-4" /> Back to store</Link>
      </div>
    </div>
  );
};

const AdminLayout = () => {
  const { user, authLoading } = useApp();
  const isAdmin = Boolean(user && user.role === "admin");
  const [chatUnread, setChatUnread] = useState(0);
  const [toPick, setToPick] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setMoreOpen(false); }, [pathname]);
  const current = useMemo(() => [...nav].sort((a, b) => b.to.length - a.to.length).find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to))) || nav[0], [pathname]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    const poll = () => api.get("/admin/chat/conversations", { params: { status: "open" } }).then(({ data }) => setChatUnread(data.unreadTotal || 0)).catch(() => {});
    poll();
    const t = setInterval(poll, 10000);
    // Orders waiting to be picked, for the red count on the phone's Orders tab (once a minute is plenty).
    const pick = () => api.get("/admin/picking").then(({ data }) => setToPick((data.orders || []).length)).catch(() => {});
    pick();
    const t2 = setInterval(pick, 60000);
    return () => { clearInterval(t); clearInterval(t2); };
  }, [isAdmin]);

  if (authLoading) return <div className="max-w-[1280px] mx-auto px-4 py-24 text-center text-neutral-500">Loading...</div>;
  if (!user || user.role !== "admin") {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-24 text-center" data-testid="admin-denied">
        <ShieldAlert className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h1 className="font-heading text-3xl mb-2">Admin access required</h1>
        <p className="text-neutral-500 mb-6">{user ? "This account is not an administrator." : "Please log in with an admin account."}</p>
        <Link to="/my-account" className="inline-block px-6 py-3 bg-emerald-600 text-white font-bold rounded-full">{user ? "Go to my account" : "Log in"}</Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 pt-4 pb-28 lg:py-8" data-testid="admin-layout">
      {/* Phones: page title + jump-to search; the full menu lives in the bottom bar's "More" sheet. */}
      <div className="lg:hidden flex items-center gap-2 mb-4" data-testid="admin-mobile-title">
        <current.icon className="h-5 w-5 text-emerald-700" aria-hidden="true" />
        <h1 className="flex-1 font-heading text-xl uppercase tracking-tight truncate">{current.label}</h1>
        <button type="button" onClick={() => setMoreOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl bg-neutral-100" aria-label="Find an admin page"><Search className="h-5 w-5" /></button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8">
        <aside className="hidden lg:block">
          <div className="lg:sticky lg:top-[180px]">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mb-3">HD Smoke Shop Admin</p>
            <nav className="flex flex-wrap lg:flex-nowrap lg:flex-col gap-1">
              {nav.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  data-testid={`admin-nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
                  className={({ isActive }) => `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${isActive ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"}`}
                >
                  <n.icon className="h-4 w-4" /> {n.label}
                  {n.badge === "chat" && chatUnread > 0 && <span data-testid="admin-nav-chat-badge" className="ml-auto text-[11px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5">{chatUnread}</span>}
                </NavLink>
              ))}
            </nav>
            <Link to="/" className="mt-6 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:underline"><ArrowLeft className="h-3.5 w-3.5" /> Back to store</Link>
          </div>
        </aside>
        <section className="min-w-0">
          <Suspense fallback={<div className="min-h-[40vh]" aria-busy="true" />}><Outlet /></Suspense>
        </section>
      </div>
      <nav className="lg:hidden fixed inset-x-0 bottom-0 z-[70] grid grid-cols-5 border-t border-neutral-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]" data-testid="admin-tabbar" aria-label="Admin">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `relative flex flex-col items-center gap-0.5 pt-2 pb-2.5 text-[11px] font-bold ${isActive && !moreOpen ? "text-emerald-700" : "text-neutral-500"}`}>
            <t.icon className="h-5 w-5" aria-hidden="true" />{t.label}
            <Count n={t.badge === "chat" ? chatUnread : t.badge === "pick" ? toPick : 0} className="absolute top-1 left-1/2 ml-1.5" />
          </NavLink>
        ))}
        <button type="button" onClick={() => setMoreOpen(true)} className={`flex flex-col items-center gap-0.5 pt-2 pb-2.5 text-[11px] font-bold ${moreOpen ? "text-emerald-700" : "text-neutral-500"}`} data-testid="admin-tab-more">
          <Menu className="h-5 w-5" aria-hidden="true" />More
        </button>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} counts={{ chat: chatUnread, pick: toPick }} />
    </div>
  );
};

export default AdminLayout;
