import React, { useEffect, useState } from "react";
import { NavLink, Link, Outlet } from "react-router-dom";
import { LayoutDashboard, Package, ShoppingBag, Bell, ArrowLeft, ShieldAlert, Images, Mail, Ticket, Settings, Tag, FolderTree, Gift, MessageCircle, Truck, ShieldCheck, BarChart3, Store, Camera, Bot, Barcode, Receipt, Wallet, FileText, UserRound, Sparkles, ClipboardList, Star, PackageSearch, ScanLine, Smartphone } from "lucide-react";
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

const AdminLayout = () => {
  const { user, authLoading } = useApp();
  const isAdmin = Boolean(user && user.role === "admin");
  const [chatUnread, setChatUnread] = useState(0);

  useEffect(() => {
    if (!isAdmin) return undefined;
    const poll = () => api.get("/admin/chat/conversations", { params: { status: "open" } }).then(({ data }) => setChatUnread(data.unreadTotal || 0)).catch(() => {});
    poll();
    const t = setInterval(poll, 10000);
    return () => clearInterval(t);
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
    <div className="max-w-[1400px] mx-auto px-4 py-8" data-testid="admin-layout">
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8">
        <aside>
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
          <Outlet />
        </section>
      </div>
    </div>
  );
};

export default AdminLayout;
