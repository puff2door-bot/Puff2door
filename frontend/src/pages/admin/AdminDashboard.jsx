import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DollarSign, ShoppingBag, Package, Users, AlertTriangle, Bell } from "lucide-react";
import api from "../../api";

const Stat = ({ icon: Icon, label, value, tone = "emerald", testId }) => (
  <div className="border border-neutral-200 rounded-2xl p-5 flex items-center gap-4" data-testid={testId}>
    <span className={`h-11 w-11 grid place-items-center rounded-full bg-${tone}-100 text-${tone}-700 shrink-0`}><Icon className="h-5 w-5" /></span>
    <div>
      <p className="text-xs text-neutral-500 uppercase tracking-wide font-semibold">{label}</p>
      <p className="font-heading text-2xl text-neutral-900">{value}</p>
    </div>
  </div>
);

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/admin/stats").then(({ data }) => setStats(data)).catch((e) => setError(e?.response?.data?.detail || "Failed to load stats"));
  }, []);

  if (error) return <p className="text-red-500">{error}</p>;
  if (!stats) return <p className="text-neutral-500">Loading dashboard...</p>;

  return (
    <div data-testid="admin-dashboard">
      <h1 className="font-heading text-3xl uppercase tracking-tight mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <Stat icon={DollarSign} label="Revenue" value={`$${stats.revenue.toFixed(2)}`} testId="stat-revenue" />
        <Stat icon={ShoppingBag} label="Orders (today)" value={`${stats.totalOrders} (${stats.todayOrders})`} testId="stat-orders" />
        <Stat icon={Package} label="Active products" value={stats.activeProducts} testId="stat-products" />
        <Stat icon={Users} label="Customers" value={stats.customers} testId="stat-customers" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-neutral-200 rounded-2xl p-5">
          <h2 className="font-heading text-xl uppercase tracking-wide mb-4 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /> Low stock (≤ 5)</h2>
          {stats.lowStock.length === 0 ? (
            <p className="text-sm text-neutral-500">All products are well stocked.</p>
          ) : (
            <ul className="divide-y" data-testid="low-stock-list">
              {stats.lowStock.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                  <Link to={`/admin/products?edit=${p.id}`} className="hover:text-emerald-600 line-clamp-1">{p.name}</Link>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${p.stock === 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{p.stock === 0 ? "Sold out" : `${p.stock} left`}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border border-neutral-200 rounded-2xl p-5">
          <h2 className="font-heading text-xl uppercase tracking-wide mb-4 flex items-center gap-2"><Bell className="h-5 w-5 text-emerald-600" /> Restock alerts</h2>
          <p className="font-heading text-4xl mb-1" data-testid="stat-pending-alerts">{stats.pendingAlerts}</p>
          <p className="text-sm text-neutral-500 mb-4">customers waiting for sold-out products. Restocking a product notifies them automatically.</p>
          <Link to="/admin/alerts" className="text-sm font-bold text-emerald-600 hover:underline">View all alerts</Link>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
