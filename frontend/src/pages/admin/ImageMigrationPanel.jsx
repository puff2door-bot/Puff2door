import React, { useEffect, useState } from "react";
import { CloudDownload, Loader2, CheckCircle2, AlertTriangle, Undo2 } from "lucide-react";
import api from "../../api";
import { useToast } from "../../hooks/use-toast";

export const ImageMigrationPanel = ({ onChanged }) => {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const load = () => api.get("/admin/products/migrate-images/status").then(({ data }) => setStatus(data)).catch(() => {});
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!status?.running) return undefined;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [status?.running]);
  useEffect(() => {
    if (status && !status.running && status.finishedAt && status.done === status.total && status.total > 0) onChanged?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.finishedAt]);

  const start = async () => {
    setBusy(true);
    try {
      await api.post("/admin/products/migrate-images");
      toast({ title: "Image import started", description: "Copying product photos into Puff2door storage…" });
      setTimeout(load, 500);
    } catch (e) {
      toast({ title: "Could not start", description: e?.response?.data?.detail || "Try again", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const revert = async () => {
    if (!window.confirm("Restore the original third-party image links for all products?")) return;
    const { data } = await api.post("/admin/products/migrate-images/revert");
    toast({ title: "Reverted", description: `${data.reverted} product(s) restored to original image links.` });
    load();
    onChanged?.();
  };

  if (!status) return null;
  const pct = status.total ? Math.round((status.done / status.total) * 100) : 0;
  const allLocal = status.externalRemaining === 0;

  return (
    <div data-testid="image-migration-panel" className={`mb-6 rounded-xl border p-4 flex flex-col md:flex-row md:items-center gap-4 ${allLocal ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <span className={`grid place-items-center h-10 w-10 rounded-full shrink-0 ${allLocal ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
        {status.running ? <Loader2 className="h-5 w-5 animate-spin" /> : allLocal ? <CheckCircle2 className="h-5 w-5" /> : <CloudDownload className="h-5 w-5" />}
      </span>
      <div className="flex-1 text-sm">
        {status.running ? (
          <>
            <p className="font-semibold" data-testid="migration-progress">Importing images… {status.done}/{status.total} ({pct}%)</p>
            <div className="h-1.5 bg-white rounded-full mt-2 overflow-hidden"><div className="h-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} /></div>
          </>
        ) : allLocal ? (
          <p className="font-semibold text-emerald-800" data-testid="migration-done">All product photos are hosted on Puff2door storage ({status.migratedProducts} of {status.products} products imported).{status.finishedAt && status.total > 0 ? ` Last import: ${status.migrated} image(s) copied${status.failed.length ? `, ${status.failed.length} failed` : ""}.` : ""}</p>
        ) : (
          <p className="font-semibold text-amber-900" data-testid="migration-pending">{status.externalRemaining} product image(s) are still loaded from a third-party website. Import them so they load faster and can't disappear.</p>
        )}
        {status.failed?.length > 0 && !status.running && (
          <details className="mt-2 text-xs text-amber-900">
            <summary className="cursor-pointer inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> {status.failed.length} image(s) could not be imported</summary>
            <ul className="mt-1 list-disc pl-5 space-y-0.5">{status.failed.map((f, i) => <li key={i}>#{f.id} {f.name} ({f.field}): {f.error}</li>)}</ul>
          </details>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        {!allLocal && !status.running && (
          <button onClick={start} disabled={busy} data-testid="migration-start" className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-full hover:bg-emerald-700 disabled:opacity-50">
            <CloudDownload className="h-3.5 w-3.5" /> Import images to Puff2door
          </button>
        )}
        {allLocal && !status.running && status.migratedProducts > 0 && (
          <button onClick={revert} data-testid="migration-revert" className="inline-flex items-center gap-1.5 px-4 py-2 border border-neutral-300 text-neutral-700 text-xs font-bold rounded-full hover:bg-white">
            <Undo2 className="h-3.5 w-3.5" /> Restore original links
          </button>
        )}
      </div>
    </div>
  );
};

export default ImageMigrationPanel;
