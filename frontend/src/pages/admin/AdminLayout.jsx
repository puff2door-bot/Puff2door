import React from "react";
import { NavLink, Link, Outlet } from "react-router-dom";
import { LayoutDashboard, Package, ShoppingBag, Bell, ArrowLeft, ShieldAlert, Images, Mail, Ticket, Settings, Tag, FolderTree } from "lucide-react";
import { useApp } from "../../context/AppContext";

const nav = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/orders", label: "Orders", icon: ShoppingBag },
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
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mb-3">Puff2Door Admin</p>
            <nav className="flex lg:flex-col gap-1 overflow-x-auto no-scrollbar">
              {nav.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  data-testid={`admin-nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
                  className={({ isActive }) => `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${isActive ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"}`}
                >
                  <n.icon className="h-4 w-4" /> {n.label}
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
