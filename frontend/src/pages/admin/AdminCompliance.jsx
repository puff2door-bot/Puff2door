import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileCheck2, ImageOff, RefreshCw, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../../api";
import { useToast } from "../../hooks/use-toast";

const AdminCompliance = () => {
  const [data, setData] = useState(null);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();
  const load = useCallback(() => api.get("/admin/compliance").then(({ data }) => setData(data)), []);
  useEffect(() => { load().catch(() => toast({ title: "Could not load compliance records", variant: "destructive" })); }, [load, toast]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { data: blob } = await api.get("/admin/compliance/export.csv", { responseType: "blob" });
      const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = `puff2door-compliance-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
      toast({ title: "Compliance export downloaded" });
    } catch { toast({ title: "Export failed", variant: "destructive" }); }
    finally { setExporting(false); }
  };

  if (!data) return <p className="text-neutral-500">Loading compliance records...</p>;
  return (
    <div data-testid="admin-compliance">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6"><div><h1 className="font-heading text-3xl uppercase tracking-tight">Compliance &amp; ID Records</h1><p className="text-sm text-neutral-500">Age checks, door verification, missing-record alerts, and downloadable audit history.</p></div><div className="flex gap-2"><button onClick={load} className="h-10 w-10 grid place-items-center rounded-lg border" aria-label="Refresh"><RefreshCw className="h-4 w-4" /></button><button onClick={exportCsv} disabled={exporting} className="inline-flex items-center gap-2 rounded-full bg-neutral-900 text-white px-5 py-2.5 text-sm font-bold disabled:opacity-50"><Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export CSV"}</button></div></div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {[["Open alerts", data.summary.openAlerts, AlertTriangle], ["Critical", data.summary.criticalAlerts, AlertTriangle], ["ID passed", data.summary.passedIdChecks, CheckCircle2], ["ID failed", data.summary.failedIdChecks, FileCheck2], ["ID images stored", data.summary.storedIdImages, ImageOff]].map(([label, value, Icon]) => <div key={label} className="rounded-xl border p-4"><Icon className="h-4 w-4 text-emerald-600" /><p className="text-xs text-neutral-500 mt-2">{label}</p><p className="font-heading text-2xl">{value}</p></div>)}
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 mb-6 flex gap-3"><ShieldCheck className="h-5 w-5 text-emerald-700 shrink-0" /><div><p className="text-sm font-bold text-emerald-900">Privacy safeguard active</p><p className="text-xs text-emerald-800 mt-1">{data.privacy.policy} Complete ID images are not collected by this workflow.</p></div></div>

      <section className="mb-8"><h2 className="font-heading text-xl uppercase tracking-wide mb-3">Administrator alerts</h2>{!data.alerts.length ? <div className="rounded-xl border p-5 text-sm text-emerald-700"><CheckCircle2 className="inline h-4 w-4 mr-2" />No missing compliance records found.</div> : <div className="space-y-2">{data.alerts.map((a) => <div key={a.id} className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${a.severity === "critical" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}><AlertTriangle className={`h-5 w-5 shrink-0 ${a.severity === "critical" ? "text-red-600" : "text-amber-600"}`} /><div className="flex-1"><p className="text-sm font-bold capitalize">{a.kind.replaceAll("_", " ")}</p><p className="text-xs text-neutral-700">{a.message}</p></div>{a.orderId && <Link to="/admin/operations" className="text-xs font-bold underline">Open operations</Link>}{a.productId && <Link to="/admin/products" className="text-xs font-bold underline">Review product</Link>}</div>)}</div>}</section>

      <section><h2 className="font-heading text-xl uppercase tracking-wide mb-3">Audit history</h2><div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><thead className="bg-neutral-50 text-xs uppercase text-neutral-500"><tr><th className="p-3">Time</th><th className="p-3">Order</th><th className="p-3">Event</th><th className="p-3">Result</th><th className="p-3">Checked by</th><th className="p-3">ID image</th></tr></thead><tbody>{data.events.map((e) => <tr key={e.id} className="border-t"><td className="p-3 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td><td className="p-3 font-bold">{e.orderNumber}</td><td className="p-3 capitalize">{String(e.event).replaceAll("_", " ")}</td><td className="p-3 capitalize">{e.result || "recorded"}</td><td className="p-3">{e.checkedBy || "System"}</td><td className="p-3 text-emerald-700 font-bold">Not stored</td></tr>)}</tbody></table>{!data.events.length && <p className="p-6 text-center text-neutral-500">No compliance events yet.</p>}</div></section>
    </div>
  );
};

export default AdminCompliance;
