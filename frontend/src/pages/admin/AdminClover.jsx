import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, ExternalLink, Link2, PackagePlus, RefreshCw, Store, Unplug } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import api from "../../api";
import { useToast } from "../../hooks/use-toast";
import SearchableSelect from "../../components/admin/SearchableSelect";

const when = (value) => value ? new Date(value).toLocaleString() : "Never";

const AdminClover = () => {
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [products, setProducts] = useState([]);
  const [choice, setChoice] = useState({});
  const [mapRows, setMapRows] = useState(null);
  const [aliasRows, setAliasRows] = useState(null);
  const [previewQuery, setPreviewQuery] = useState("");
  const [previewFilter, setPreviewFilter] = useState("all");
  const [previewPage, setPreviewPage] = useState(0);
  const [connectionResult, setConnectionResult] = useState("");
  const [syncResult, setSyncResult] = useState("");
  const [unmatchedQuery, setUnmatchedQuery] = useState("");
  const [unmatchedPage, setUnmatchedPage] = useState(0);
  const [busy, setBusy] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const load = useCallback(async () => {
    const [statusResult, logsResult, productResult] = await Promise.all([
      api.get("/admin/clover/status"),
      api.get("/admin/clover/logs"),
      api.get("/admin/products"),
    ]);
    setStatus(statusResult.data);
    setLogs(logsResult.data.logs || []);
    setProducts(productResult.data.products || []);
  }, []);

  useEffect(() => {
    load().catch((error) => toast({ title: "Could not load Clover", description: error?.response?.data?.detail || "Try again.", variant: "destructive" }));
  }, [load, toast]);

  useEffect(() => {
    if (mapRows === null && status?.categoryMappings) setMapRows(status.categoryMappings);
    if (aliasRows === null && status?.brandAliasRows) setAliasRows(status.brandAliasRows);
  }, [status, mapRows, aliasRows]);

  useEffect(() => {
    const result = searchParams.get("clover");
    if (!result) return;
    toast({
      title: result === "connected" ? "Clover connected" : "Clover connection did not finish",
      description: result === "connected" ? "Clover is connected. Stock and prices stay put until automatic sync is turned on." : "Return here and try Connect Clover again.",
      variant: result === "connected" ? "default" : "destructive",
    });
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, toast]);

  const unlinkedProducts = useMemo(() => products.filter((product) => !product.cloverItemId), [products]);

  const run = async (key, action, success) => {
    setBusy(key);
    try {
      await action();
      await load();
      toast({ title: success });
    } catch (error) {
      toast({ title: "Clover action failed", description: error?.response?.data?.detail || "Try again.", variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const connect = () => run("connect", async () => {
    const { data } = await api.post("/admin/clover/connect-url");
    window.location.assign(data.url);
  }, "Opening Clover");

  const sync = async (preview = false) => {
    setBusy(preview ? "preview" : "sync");
    try {
      const { data } = await api.post(`/admin/clover/sync${preview ? "?preview=true" : ""}`);
      const text = preview
        ? `Preview: ${data.plannedLinks?.length || 0} would link automatically, ${data.linkCandidates?.length || 0} need confirmation. Nothing was written.`
        : `Linked ${data.linkedItems || 0}. New from Clover ${data.importedItems || 0}. Stock updated ${data.stockChanges || 0}. Skipped ${data.skippedItems || data.unmatchedItems || 0}.`;
      setSyncResult(text);
      await load();
      toast({ title: preview ? "Preview finished" : "Inventory synced from Clover", description: text });
    } catch (error) {
      toast({ title: "Clover action failed", description: error?.response?.data?.detail || "Try again.", variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const testConnection = async () => {
    setBusy("test");
    try {
      const { data } = await api.post("/admin/clover/test-connection");
      const text = `${data.name || "Merchant"} · ${data.itemCount} items`;
      setConnectionResult(text);
      toast({ title: "Clover token works", description: text });
    } catch (error) {
      const text = error?.response?.data?.detail || "Try again.";
      setConnectionResult(text);
      toast({ title: "Clover connection failed", description: text, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const link = (item, productId) => {
    const chosen = Number(productId || choice[item.id]);
    if (!chosen) {
      toast({ title: "Enter the website product id to connect", variant: "destructive" });
      return;
    }
    run(`link-${item.id}`, () => api.post("/admin/clover/link", { productId: chosen, cloverItemId: item.id }), "Product connected to Clover");
  };

  const importItem = (item) => run(`import-${item.id}`, () => api.post("/admin/clover/import", { cloverItemId: item.id }), "Hidden draft saved for review");

  const saveAliases = async () => {
    setBusy("aliases");
    try {
      await api.put("/admin/clover/brand-aliases", { rows: aliasRows || [] });
      await load();
      toast({ title: "Brand aliases saved" });
    } catch (error) {
      toast({ title: "Aliases were not saved", description: error?.response?.data?.detail || "Try again.", variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const writeBack = async (confirm) => {
    const result = await api.post("/admin/clover/category-writeback", { confirm });
    return result.data;
  };

  const applyWriteback = async () => {
    setBusy("writeback");
    try {
      const plan = await writeBack(false);
      const lines = (plan.plan?.changes || []).slice(0, 12).map((row) => `${row.name}: ${row.action} ${row.detail}`);
      const message = lines.length ? lines.join("\n") : "No category or brand changes to send.";
      if (!window.confirm(`Apply category and brand tags to Clover?\n\n${message}`)) return;
      await writeBack(true);
      await load();
      toast({ title: plan.reason === "writeback_disabled" ? "Write-back is off" : "Clover categories and tags updated" });
    } catch (error) {
      toast({ title: "Clover was not updated", description: error?.response?.data?.detail || "Try again.", variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const undoBatch = () => run("undo", () => api.post("/admin/clover/undo"), "Last Clover batch undone");

  const saveMap = async () => {
    setBusy("map");
    try {
      const mappings = (mapRows || []).filter((row) => row.cloverName.trim() && (row.categorySlug || row.keywordSplit));
      const { data } = await api.put("/admin/clover/category-map", { mappings });
      setMapRows(data.mappings || []);
      await load();
      toast({ title: "Category mapping saved" });
    } catch (error) {
      toast({ title: "Mapping was not saved", description: error?.response?.data?.detail || "Try again.", variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const disconnect = () => {
    if (!window.confirm("Disconnect Clover inventory sync? Product links stay saved so they can be reused after reconnecting.")) return;
    run("disconnect", () => api.post("/admin/clover/disconnect"), "Clover disconnected");
  };

  if (!status) return <div className="py-16 text-center text-neutral-500">Loading Clover inventory…</div>;

  const summary = status.lastSyncSummary || {};
  return (
    <div data-testid="admin-clover">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-7">
        <div>
          <h1 className="font-heading text-3xl uppercase tracking-tight">Clover Inventory</h1>
          <p className="text-sm text-neutral-500 mt-1">Keep HD Smoke Shop stock aligned with your Clover store without a third-party monthly subscription.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status.connected && <button onClick={() => sync(false)} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${busy === "sync" ? "animate-spin" : ""}`} /> {status.automaticSync ? "Sync now" : "Preview sync"}</button>}
          {status.connected && status.automaticSync && <button onClick={() => sync(true)} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-bold disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${busy === "preview" ? "animate-spin" : ""}`} /> Preview sync</button>}
          {status.tokenMode && <button onClick={testConnection} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-bold disabled:opacity-50">Test connection</button>}
          {!status.connected && !status.tokenMode && <button onClick={connect} disabled={Boolean(busy) || !status.configured} className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"><ExternalLink className="h-4 w-4" /> Connect Clover</button>}
        </div>
      </div>

      <section className={`mb-6 rounded-2xl border p-5 ${status.automaticSync ? "border-emerald-300 bg-emerald-50/60" : "border-amber-300 bg-amber-50"}`}>
        <h2 className="font-bold">{status.automaticSync ? "Automatic sync is on" : "Automatic sync is off"}</h2>
        <p className="mt-1 text-sm text-neutral-700">{status.automaticSync ? `Clover is checked about every ${status.scheduleMinutes} minutes${status.tokenMode ? ". Webhooks need a Clover app, so this connection uses that pull and Sync now." : ", and inventory webhooks update stock and prices."} Online orders reduce the linked Clover count once.` : "Preview sync lists stock, price, and photo matches without changing the website or Clover. Set CLOVER_SYNC_ENABLED on the server when you want those updates to apply."}</p>
        {status.dryRun && status.syncEnabled && <p className="mt-2 text-sm font-semibold text-amber-800">Dry run is on, so scheduled sync reports changes and does not write them.</p>}
        {connectionResult && <p className="mt-2 text-sm font-semibold" data-testid="clover-connection-result">{connectionResult}</p>}
        {syncResult && <p className="mt-2 text-sm font-semibold" data-testid="clover-sync-result">{syncResult}</p>}
        {status.lastCatalogPlan?.dryRun && <p className="mt-2 text-sm">Last preview: {(status.lastCatalogPlan.stockChanges || []).length} stock change(s), {(status.lastCatalogPlan.priceChanges || []).length} price change(s), {(status.lastCatalogPlan.photoLinks || []).length} photo link(s).</p>}
      </section>

      {!status.configured && (
        <section className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-neutral-900">
          <div className="flex gap-3"><CircleAlert className="h-5 w-5 shrink-0 text-amber-600" /><div><h2 className="font-bold">One secure setup step remains</h2><p className="mt-1 text-sm text-neutral-700">{(status.missingSetup || []).some((item) => item.includes("API")) ? "Add the merchant API token and the 13-character merchant id to the server environment. The token is never shown in this browser." : "Create a private Clover app, then add the App ID and App Secret to Render's secure environment settings. Secrets are never shown or saved in this browser."}</p><p className="mt-2 text-xs font-semibold">Missing: {status.missingSetup.join(", ") || "Clover credentials"}</p></div></div>
        </section>
      )}

      {status.productsNeedingRetry > 0 && (
        <section className="mb-6 rounded-2xl border border-red-300 bg-red-50 p-5 text-red-800">
          <div className="flex gap-3"><CircleAlert className="h-5 w-5 shrink-0" /><div><h2 className="font-bold">{status.productsNeedingRetry} product{status.productsNeedingRetry === 1 ? "" : "s"} need a Clover retry</h2><p className="mt-1 text-sm">Open Products and use the retry icon, or correct the item and save it again. The website copy remains safely saved.</p></div></div>
        </section>
      )}

      <section className={`mb-6 rounded-2xl border p-5 ${status.connected ? "border-emerald-300 bg-emerald-50/60" : "border-neutral-200"}`}>
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${status.connected ? "bg-emerald-600 text-white" : "bg-neutral-100 text-neutral-500"}`}><Store className="h-6 w-6" /></div>
          <div className="flex-1">
            <div className="flex items-center gap-2"><h2 className="font-bold text-lg">{status.tokenMode ? "Connected with API token" : status.connected ? status.merchantName || "Clover store connected" : "Clover is not connected"}</h2>{status.connected && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}</div>
            <p className="text-sm text-neutral-600">{status.connected ? `Merchant ${status.merchantId} · ${status.environment}` : "Connect once to authorize secure inventory access."}</p>
          </div>
          {status.connected && !status.tokenMode && <button onClick={disconnect} disabled={Boolean(busy)} className="inline-flex items-center gap-2 text-xs font-bold text-red-600 hover:underline disabled:opacity-50"><Unplug className="h-4 w-4" /> Disconnect</button>}
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl border p-4"><p className="text-xs uppercase tracking-wide text-neutral-500">Website products</p><p className="font-heading text-3xl mt-1">{status.totalProducts}</p></div>
        <div className="rounded-xl border p-4"><p className="text-xs uppercase tracking-wide text-neutral-500">Connected</p><p className="font-heading text-3xl mt-1 text-emerald-600">{status.linkedProducts}</p></div>
        <div className="rounded-xl border p-4"><p className="text-xs uppercase tracking-wide text-neutral-500">Needs review</p><p className="font-heading text-3xl mt-1">{status.unmatchedItems.length}</p></div>
        <div className="rounded-xl border p-4"><p className="text-xs uppercase tracking-wide text-neutral-500">Stock changes</p><p className="font-heading text-3xl mt-1">{summary.stockChanges || 0}</p></div>
      </div>

      <section className="rounded-2xl border p-5 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div><h2 className="font-bold">Sync health</h2><p className="text-sm text-neutral-500">Last sync: {when(status.lastSyncAt)}</p></div>
          <span className={`self-start rounded-full px-3 py-1 text-xs font-bold ${status.lastSyncStatus === "success" ? "bg-emerald-100 text-emerald-700" : status.lastSyncStatus === "failed" ? "bg-red-100 text-red-700" : "bg-neutral-100 text-neutral-600"}`}>{status.lastSyncStatus}</span>
        </div>
        {status.lastSyncError && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{status.lastSyncError}</p>}
        <div className="mt-4 grid gap-2 text-xs text-neutral-600">
          <p><span className="font-bold text-neutral-900">Webhook URL:</span> <code className="break-all">{status.webhookUrl}</code></p>
          <p><span className="font-bold text-neutral-900">Redirect URL:</span> <code className="break-all">{status.redirectUri}</code></p>
          {status.webhookVerificationCode && <p><span className="font-bold text-neutral-900">Clover verification code:</span> <code>{status.webhookVerificationCode}</code></p>}
          <p className={status.tokenMode ? "text-neutral-600" : status.webhookAuthConfigured ? "text-emerald-700" : "text-amber-700"}>{status.tokenMode ? "Webhooks need a Clover app. This connection uses the scheduled pull and Sync now." : status.webhookAuthConfigured ? "Webhook authentication is configured." : "Add the Clover webhook auth code before enabling live webhooks."}</p>
        </div>
      </section>

      {(Array.isArray(status.lastCatalogPlan?.stockChanges) || (status.lastCatalogPlan?.cloverStockChanges || []).length > 0 || (status.lastCatalogPlan?.priceChanges || []).length > 0) && (
        <section className="rounded-2xl border overflow-hidden mb-6" data-testid="clover-preview-summary">
          <div className="p-5 border-b"><h2 className="font-bold">Preview summary</h2><p className="text-sm text-neutral-500 mt-1">Planned changes in both directions. Nothing is written while automatic sync is off.</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500"><tr><th className="px-4 py-2">Direction</th><th className="px-4 py-2">Item</th><th className="px-4 py-2">Change</th></tr></thead>
              <tbody>
                {(Array.isArray(status.lastCatalogPlan.stockChanges) ? status.lastCatalogPlan.stockChanges : []).slice(0, 8).map((row) => (
                  <tr key={`stock-${row.productId}-${row.cloverItemId}`} className="border-t"><td className="px-4 py-2">Clover → website</td><td className="px-4 py-2">{row.name || row.cloverItemId}</td><td className="px-4 py-2">Stock {row.from} → {row.to}</td></tr>
                ))}
                {(status.lastCatalogPlan.cloverStockChanges || []).slice(0, 8).map((row) => (
                  <tr key={`clover-${row.orderId}-${row.cloverItemId}-${row.action}`} className="border-t"><td className="px-4 py-2">Website → Clover</td><td className="px-4 py-2">{row.name || row.cloverItemId}</td><td className="px-4 py-2">{row.action} {row.qty} ({row.status})</td></tr>
                ))}
                {(Array.isArray(status.lastCatalogPlan.priceChanges) ? status.lastCatalogPlan.priceChanges : []).slice(0, 8).map((row) => (
                  <tr key={`price-${row.productId}-${row.cloverItemId}`} className="border-t"><td className="px-4 py-2">Price</td><td className="px-4 py-2">{row.name || row.cloverItemId}</td><td className="px-4 py-2">{row.from} → {row.to}</td></tr>
                ))}
                {(status.lastCatalogPlan.fieldChanges || []).slice(0, 8).map((row, index) => (
                  <tr key={`field-${row.productId}-${row.field}-${index}`} className="border-t"><td className="px-4 py-2">{row.direction === "website_to_clover" ? "Website → Clover" : row.direction === "clover_to_website" ? "Clover → website" : "Conflict"}</td><td className="px-4 py-2">{row.name}</td><td className="px-4 py-2">{row.field} {String(row.from)} → {String(row.to)}{row.blocked ? ` (${row.blocked})` : ""}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-2xl border overflow-hidden mb-6" data-testid="stock-mismatch-view">
        <div className="p-5 border-b"><h2 className="font-bold">Stock mismatches</h2><p className="text-sm text-neutral-500 mt-1">Website quantity, the last Clover quantity, and when it was updated. A pending row is a website sale Clover has not confirmed yet.</p></div>
        {(status.stockMismatches || []).length === 0 ? <p className="p-5 text-sm text-neutral-500">No quantity mismatches.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500"><tr><th className="px-4 py-2">Item</th><th className="px-4 py-2">Website</th><th className="px-4 py-2">Clover</th><th className="px-4 py-2">Updated</th><th className="px-4 py-2">State</th></tr></thead>
              <tbody>
                {status.stockMismatches.map((row) => (
                  <tr key={row.productId} className="border-t" data-testid={`stock-mismatch-${row.productId}`}><td className="px-4 py-2">{row.name}</td><td className="px-4 py-2">{row.websiteQty}</td><td className="px-4 py-2">{row.cloverQty}</td><td className="px-4 py-2">{when(row.updatedAt)}</td><td className="px-4 py-2">{row.state}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div><h2 className="font-bold">Clover category mapping</h2><p className="text-sm text-neutral-500 mt-1">Clover category name to an existing website category. Later syncs use this table. It does not create new categories.</p></div>
          <button type="button" onClick={saveMap} disabled={Boolean(busy)} className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Save mapping</button>
        </div>
        <div className="mt-4 space-y-2">
          {(mapRows || []).map((row, index) => (
            <div key={`${row.cloverName}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_220px_auto]">
              <input value={row.cloverName} onChange={(event) => setMapRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, cloverName: event.target.value } : item))} className="rounded-lg border px-3 py-2 text-sm" placeholder="Clover category name" />
              {row.keywordSplit ? <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-neutral-600">Keyword split: cigars, hemp wraps, or hookah. Otherwise needs review.</p> : <SearchableSelect
                testId={`clover-map-${index}`}
                placeholder="Search website categories"
                buttonClassName="rounded-lg border px-3 py-2 text-sm bg-white w-full text-left"
                options={(status.websiteCategories || []).map((category) => ({ value: category.slug, label: category.name }))}
                value={row.categorySlug}
                onChange={(categorySlug) => setMapRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, categorySlug } : item))}
              />}
              <button type="button" className="text-xs font-bold text-red-600" onClick={() => setMapRows((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
            </div>
          ))}
          <button type="button" className="text-xs font-bold text-emerald-700" onClick={() => setMapRows((current) => [...(current || []), { cloverName: "", categorySlug: "" }])}>Add mapping</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={applyWriteback} disabled={Boolean(busy)} className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Apply category/brand to Clover</button>
          <button type="button" onClick={undoBatch} disabled={Boolean(busy) || !status.lastUndo?.id || status.lastUndo?.undone} className="rounded-full border px-4 py-2 text-xs font-bold disabled:opacity-50">Undo last batch</button>
        </div>
        {!status.categoryWriteback && <p className="mt-2 text-xs text-amber-800">CLOVER_CATEGORY_WRITEBACK_ENABLED is off. The button previews the plan and does not write.</p>}
      </section>

      <section className="rounded-2xl border p-5 mb-6" data-testid="brand-alias-table">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div><h2 className="font-bold">Brand aliases</h2><p className="text-sm text-neutral-500 mt-1">One row per existing website brand. Aliases match item names. This does not create brands.</p></div>
          <button type="button" onClick={saveAliases} disabled={Boolean(busy)} className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Save aliases</button>
        </div>
        <div className="mt-4 space-y-2">
          {(aliasRows || []).map((row, index) => (
            <div key={row.brandSlug || index} className="grid gap-2 sm:grid-cols-[180px_1fr]">
              <p className="text-sm font-semibold py-2">{row.name}</p>
              <input value={(row.aliases || []).join(", ")} onChange={(event) => setAliasRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, aliases: event.target.value.split(",").map((part) => part.trim()).filter(Boolean) } : item))} className="rounded-lg border px-3 py-2 text-sm" placeholder="GEEK BAR, Geekbar" />
            </div>
          ))}
        </div>
      </section>

      {(status.lastCatalogPlan?.catalogReport) && (
        <section className="rounded-2xl border p-5 mb-6" data-testid="clover-catalog-report">
          <h2 className="font-bold">Unmatched names and possible duplicates</h2>
          <p className="text-sm text-neutral-500 mt-1">Counts from the last preview. Nothing is merged or deleted.</p>
          <div className="mt-3 grid gap-4 md:grid-cols-2 text-sm">
            <div><p className="font-semibold">Unmatched Clover categories</p><ul className="mt-1 space-y-1">{(status.lastCatalogPlan.catalogReport.unmatchedCategories || []).slice(0, 12).map((row) => <li key={row.name}>{row.name} · {row.count}</li>)}</ul></div>
            <div><p className="font-semibold">Unmatched brand-like names</p><ul className="mt-1 space-y-1">{(status.lastCatalogPlan.catalogReport.unmatchedBrandNames || []).slice(0, 12).map((row) => <li key={row.name}>{row.name} · {row.count}</li>)}</ul></div>
          </div>
          {(status.lastCatalogPlan.deletionFlags || []).length > 0 && <p className="mt-3 text-sm">Deletion flags: {status.lastCatalogPlan.deletionFlags.map((row) => `${row.name} (${row.flag})`).join(", ")}</p>}
          {(status.lastCatalogPlan.conflicts || []).length > 0 && <p className="mt-2 text-sm text-amber-800">Conflicts: {status.lastCatalogPlan.conflicts.map((row) => `${row.name} ${row.field}`).join(", ")}</p>}
        </section>
      )}

      {(() => {
        const previewItems = status.lastCatalogPlan?.previewItems || status.lastCatalogPlan?.reviewItems || [];
        if (!previewItems.length) return null;
        const needle = previewQuery.trim().toLowerCase();
        const filtered = previewItems.filter((item) => {
          if (previewFilter === "review" && !item.needsReview) return false;
          if (previewFilter === "matched" && item.needsReview) return false;
          if (!needle) return true;
          return `${item.name} ${(item.cloverCategories || []).join(" ")} ${item.mappedCategoryName || ""}`.toLowerCase().includes(needle);
        });
        const pageSize = 50;
        const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
        const page = Math.min(previewPage, pages - 1);
        const visible = filtered.slice(page * pageSize, page * pageSize + pageSize);
        return (
          <section className="rounded-2xl border overflow-hidden mb-6" data-testid="clover-preview-rows">
            <div className="p-5 border-b flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div><h2 className="font-bold">Preview: category and brand</h2><p className="text-sm text-neutral-500 mt-1">{filtered.length} of {status.lastCatalogPlan?.previewTotal || previewItems.length} items. A mapped Clover category is not marked needs review. Needs review is only no match or a conflict.</p></div>
              <div className="flex flex-wrap gap-2">
                <input value={previewQuery} onChange={(event) => { setPreviewQuery(event.target.value); setPreviewPage(0); }} placeholder="Filter name or category" className="rounded-lg border px-3 py-2 text-sm" data-testid="preview-filter" />
                <select value={previewFilter} onChange={(event) => { setPreviewFilter(event.target.value); setPreviewPage(0); }} className="rounded-lg border px-3 py-2 text-sm bg-white" data-testid="preview-status-filter">
                  <option value="all">All items</option>
                  <option value="matched">Mapped</option>
                  <option value="review">Needs review</option>
                </select>
              </div>
            </div>
            <div className="divide-y">{visible.map((item) => (
              <div key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div><p className="font-semibold">{item.name}</p><p className="text-xs text-neutral-500">Clover: {(item.cloverCategories || []).join(", ") || "No category"} · Website: {item.mappedCategoryName || "Unmatched"} · Brand: {item.mappedBrandName || "Unmatched"}</p></div>
                <span className={`self-start rounded-full px-3 py-1 text-xs font-bold ${item.needsReview ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{item.needsReview ? "Needs review" : "Mapped"}</span>
              </div>
            ))}</div>
            <div className="flex items-center justify-between border-t px-5 py-3 text-sm">
              <button type="button" disabled={page === 0} onClick={() => setPreviewPage(page - 1)} className="font-bold disabled:opacity-40">Previous</button>
              <span>Page {page + 1} of {pages}</span>
              <button type="button" disabled={page + 1 >= pages} onClick={() => setPreviewPage(page + 1)} className="font-bold disabled:opacity-40">Next</button>
            </div>
          </section>
        );
      })()}

      {(status.lastCatalogPlan?.unmatchedPhotoBarcodes || []).length > 0 && (
        <section className="rounded-2xl border overflow-hidden mb-6">
          <div className="p-5 border-b"><h2 className="font-bold">Photo barcodes that need review</h2><p className="text-sm text-neutral-500 mt-1">Private photos stay private. A barcode links a photo to a Clover item only when that text matches exactly, including leading zeros.</p></div>
          <div className="divide-y">{status.lastCatalogPlan.unmatchedPhotoBarcodes.map((row) => <div key={row.captureId || row.barcode} className="p-4"><p className="font-mono text-sm break-all">{row.barcode}</p><p className="text-xs text-neutral-500">{row.reason}</p></div>)}</div>
        </section>
      )}

      {(status.failedOrderPushes || []).length > 0 && (
        <section className="rounded-2xl border border-red-200 overflow-hidden mb-6">
          <div className="p-5 border-b"><h2 className="font-bold">Online orders that did not update Clover stock</h2></div>
          <div className="divide-y">{status.failedOrderPushes.map((row) => <div key={`${row.orderId}-${row.cloverItemId}`} className="p-4"><p className="text-sm font-semibold">Order {row.orderId}</p><p className="text-xs text-neutral-500">Item {row.cloverItemId} · qty {row.qty}</p><p className="text-xs text-red-700">{row.error}</p></div>)}</div>
        </section>
      )}

      {(status.linkCandidates || []).length > 0 && (
        <section className="rounded-2xl border overflow-hidden mb-6" data-testid="link-candidates">
          <div className="p-5 border-b"><h2 className="font-bold">Confirm these links</h2><p className="text-sm text-neutral-500 mt-1">High-confidence SKU, barcode, and unique name matches are already applied. These are close name matches.</p></div>
          <div className="divide-y">{status.linkCandidates.slice(0, 20).map((row) => (
            <div key={`${row.cloverItemId}-${row.productId}`} className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-semibold">{row.cloverName}</p><p className="text-xs text-neutral-500">Suggested website product: {row.productName} · {row.confidence}</p></div>
              <div className="flex gap-2">
                <button type="button" disabled={Boolean(busy)} onClick={() => link({ id: row.cloverItemId }, row.productId)} className="rounded-full border px-3 py-1.5 text-xs font-bold">Link</button>
              </div>
            </div>
          ))}</div>
        </section>
      )}

      {status.unmatchedItems.length > 0 && (
        <section className="rounded-2xl border overflow-hidden mb-6">
          <div className="p-5 border-b flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><h2 className="font-bold">Clover items that need review</h2><p className="text-sm text-neutral-500 mt-1">{status.unmatchedItems.length} shown. Search instead of loading every row. Import from Clover stays off unless CLOVER_IMPORT_NEW_ITEMS is set, and it only creates hidden products in categories and brands that already match.</p></div>
            <div className="flex gap-2">
              <input value={unmatchedQuery} onChange={(event) => { setUnmatchedQuery(event.target.value); setUnmatchedPage(0); }} placeholder="Search Clover items" className="rounded-lg border px-3 py-2 text-sm" />
              <button type="button" disabled={Boolean(busy)} onClick={() => run("import-new", () => api.post("/admin/clover/import-new"), status.importNewItems ? "Hidden drafts created for mapped items" : "Import new items is off")} className="rounded-full border px-3 py-2 text-xs font-bold">Import from Clover</button>
            </div>
          </div>
          <div className="divide-y">{status.unmatchedItems.filter((item) => `${item.name} ${item.sku || ""}`.toLowerCase().includes(unmatchedQuery.trim().toLowerCase())).slice(unmatchedPage * 20, unmatchedPage * 20 + 20).map((item) => (
              <div key={item.id} className="p-4 grid gap-3 lg:grid-cols-[1fr_220px_auto] lg:items-center">
                <div><p className="font-semibold">{item.name}</p><p className="text-xs text-neutral-500">SKU {item.sku || "—"} · Barcode {item.barcode || "—"} · ${Number(item.price || 0).toFixed(2)} · {item.stock} in stock</p><p className="text-xs text-neutral-600">Category {item.mappedCategoryName || "Unmatched"} · Brand {item.mappedBrandName || "Unmatched"}</p></div>
                <input value={choice[item.id] || ""} onChange={(event) => setChoice((old) => ({ ...old, [item.id]: event.target.value }))} placeholder="Website product id" className="rounded-lg border px-3 py-2 text-sm" />
                <button onClick={() => link(item)} disabled={Boolean(busy)} className="inline-flex items-center justify-center gap-1 rounded-full border px-4 py-2 text-xs font-bold disabled:opacity-50"><Link2 className="h-3.5 w-3.5" /> Connect</button>
              </div>
            ))}</div>
        </section>
      )}

      <section className="rounded-2xl border overflow-hidden">
        <div className="p-5 border-b"><h2 className="font-bold">Recent sync activity</h2></div>
        {!logs.length ? <p className="p-5 text-sm text-neutral-500">No Clover activity yet.</p> : <div className="divide-y">{logs.slice(0, 20).map((log) => <div key={log.id} className="p-4 flex items-start justify-between gap-4"><div><p className="text-sm font-semibold capitalize">{String(log.action || "sync").replaceAll("_", " ")}</p><p className="text-xs text-neutral-500">{log.error || (log.productId ? `Product #${log.productId}` : "Completed")}</p></div><div className="text-right"><span className={`text-xs font-bold ${log.status === "success" ? "text-emerald-600" : "text-red-600"}`}>{log.status}</span><p className="text-[11px] text-neutral-400">{when(log.createdAt)}</p></div></div>)}</div>}
      </section>
    </div>
  );
};

export default AdminClover;
