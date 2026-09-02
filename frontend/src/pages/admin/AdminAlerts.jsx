import React, { useEffect, useState } from "react";
import api from "../../api";

const AdminAlerts = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/admin/stock-alerts").then(({ data }) => setAlerts(data.alerts)).finally(() => setLoading(false));
  }, []);

  return (
    <div data-testid="admin-alerts">
      <h1 className="font-heading text-3xl uppercase tracking-tight mb-2">Restock Alerts</h1>
      <p className="text-sm text-neutral-500 mb-6">Customers who asked to be notified when a sold-out product returns. When you raise a product's stock from 0, they are marked notified automatically.</p>
      {loading ? (
        <p className="text-neutral-500">Loading...</p>
      ) : alerts.length === 0 ? (
        <p className="text-neutral-500 border border-dashed rounded-2xl p-10 text-center">No restock requests yet.</p>
      ) : (
        <div className="border border-neutral-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-[11px] uppercase tracking-wide text-neutral-500">
              <tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Requested</th><th className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody className="divide-y">
              {alerts.map((a, i) => (
                <tr key={i} data-testid={`alert-row-${a.productId}-${i}`}>
                  <td className="px-4 py-3 font-medium">{a.name || `#${a.productId}`}</td>
                  <td className="px-4 py-3 text-neutral-600">{a.email}</td>
                  <td className="px-4 py-3 text-neutral-500 text-xs">{a.createdAt ? new Date(a.createdAt).toLocaleString() : ""}</td>
                  <td className="px-4 py-3"><span className={`text-xs font-bold px-2.5 py-1 rounded-full ${a.notified ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{a.notified ? "Notified" : "Waiting"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminAlerts;
