import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Barcode, CheckCircle2, Download, Printer, RefreshCw, Search } from "lucide-react";
import api from "../../api";

// ---- barcode helpers (same rules as backend/barcodes.py) ----
const checkDigit = (body) => {
  let sum = 0;
  body.split("").reverse().forEach((n, i) => { sum += Number(n) * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10;
};
const checksumOk = (code) => (/^\d+$/.test(code) && [8, 12, 13].includes(code.length) ? checkDigit(code.slice(0, -1)) === Number(code.slice(-1)) : null);
const codeKey = (code) => { const c = code.toUpperCase(); return c.length === 13 && c.startsWith("0") && /^\d+$/.test(c) ? c.slice(1) : c; };
const clean = (v) => String(v || "").replace(/\s+/g, "");

// EAN-13 drawn as SVG bars, for printing shelf labels of store barcodes.
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
const ean13Svg = (code) => {
  if (!/^\d{13}$/.test(code)) return "";
  const d = code.split("").map(Number);
  let bits = "101";
  for (let i = 1; i <= 6; i += 1) bits += (PARITY[d[0]][i - 1] === "L" ? L : G)[d[i]];
  bits += "01010";
  for (let i = 7; i <= 12; i += 1) bits += R[d[i]];
  bits += "101";
  const w = 2, h = 70;
  const bars = bits.split("").map((b, i) => (b === "1" ? `<rect x="${(i + 9) * w}" y="0" width="${w}" height="${h}"/>` : "")).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${(bits.length + 18) * w}" height="${h + 18}" viewBox="0 0 ${(bits.length + 18) * w} ${h + 18}"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${bars}</g><text x="50%" y="${h + 15}" font-family="monospace" font-size="14" text-anchor="middle">${code}</text></svg>`;
};

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const title = (s) => String(s || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const errText = (e) => {
  const d = e?.response?.data?.detail;
  return (typeof d === "string" ? d : d?.message) || e?.message || "Something went wrong.";
};

const openPrint = (html) => {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>HD Smoke Shop</title><style>body{font-family:Arial,sans-serif;margin:16px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:6px;font-size:12px;text-align:left}.labels{display:flex;flex-wrap:wrap;gap:10px}.label{border:1px dashed #999;padding:8px;width:260px;text-align:center;font-size:12px;break-inside:avoid}</style></head><body>${html}<script>window.onload=()=>window.print()</script></body></html>`);
  win.document.close();
  return true;
};

const MissingBarcodes = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState("todo");
  const [cat, setCat] = useState("");
  const [sort, setSort] = useState("sales");
  const [codes, setCodes] = useState({});
  const [msgs, setMsgs] = useState({});
  const [confirm, setConfirm] = useState({});
  const [busy, setBusy] = useState({});
  const [session, setSession] = useState([]); // [{row, code}] saved while this page is open
  const inputs = useRef({});

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const { data: d } = await api.get("/admin/barcodes/missing");
      setData(d);
    } catch (e) { setLoadError(errText(e)); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const items = useMemo(() => data?.items || [], [data]);
  const savedIds = useMemo(() => new Set(session.map((s) => s.row.cloverItemId)), [session]);
  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))].sort(), [items]);
  const used = useMemo(() => {
    const m = { ...(data?.usedCodes || {}) };
    session.forEach((s) => { m[codeKey(s.code)] = s.row.name; });
    return m;
  }, [data, session]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows;
    if (view === "done") {
      const fromSession = session.map((s) => ({ ...s.row, barcode: s.code }));
      const older = (data?.fixed || []).filter((f) => !savedIds.has(f.cloverItemId));
      rows = [...fromSession, ...older];
    } else {
      rows = items.filter((i) => !savedIds.has(i.cloverItemId)).filter((i) => {
        if (view === "ignored") return i.ignored;
        if (i.ignored) return false;
        if (view === "instock") return i.stock > 0;
        if (view === "hidden") return i.hidden;
        return true;
      });
    }
    rows = rows.filter((i) => (!cat || i.category === cat) && (!q || `${i.name} ${i.brand} ${i.cloverItemId} ${i.sku}`.toLowerCase().includes(q)));
    const by = {
      sales: (a, b) => b.sold28 - a.sold28 || b.stock - a.stock || a.name.localeCompare(b.name),
      stock: (a, b) => b.stock - a.stock || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      cat: (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    };
    return view === "done" ? rows : [...rows].sort(by[sort]);
  }, [items, data, session, savedIds, view, cat, query, sort]);

  const todo = items.filter((i) => !i.ignored && !savedIds.has(i.cloverItemId));
  const totalWork = items.length;
  const resolved = totalWork - todo.length;
  const pct = totalWork ? Math.round((resolved / totalWork) * 100) : 100;

  const setMsg = (id, kind, text) => setMsgs((m) => ({ ...m, [id]: text ? { kind, text } : null }));

  const focusNext = (afterId) => {
    const rows = list.filter((r) => r.cloverItemId !== afterId);
    const idx = list.findIndex((r) => r.cloverItemId === afterId);
    const next = rows[Math.min(Math.max(idx, 0), rows.length - 1)];
    if (next) setTimeout(() => inputs.current[next.cloverItemId]?.focus(), 50);
  };

  const save = async (row) => {
    const id = row.cloverItemId;
    const code = clean(codes[id]);
    if (!code) { setMsg(id, "err", "Scan the barcode first."); inputs.current[id]?.focus(); return; }
    if (!/^[0-9A-Za-z-]{4,32}$/.test(code)) { setMsg(id, "err", "Barcodes are letters, numbers and dashes only (4–32 characters)."); return; }
    const dupe = used[codeKey(code)] || (code.length === 12 && used[codeKey("0" + code)]);
    if (dupe && dupe !== row.name) { setMsg(id, "err", `Already used by “${dupe}”. One barcode can only belong to one item.`); return; }
    const allowBad = confirm[id] === code;
    if (checksumOk(code) === false && !allowBad) {
      setConfirm((c) => ({ ...c, [id]: code }));
      setMsg(id, "warn", "That doesn't look like a valid UPC/EAN (the check digit is off). Scan it again, or press Save once more to keep it anyway.");
      return;
    }
    setBusy((b) => ({ ...b, [id]: true })); setMsg(id, "", "");
    try {
      await api.post("/admin/barcodes/save", { cloverItemId: id, code, allowBadChecksum: allowBad });
      setSession((s) => [{ row, code }, ...s]);
      setCodes((c) => ({ ...c, [id]: "" }));
      focusNext(id);
    } catch (e) {
      setMsg(id, "err", errText(e));
    }
    setBusy((b) => ({ ...b, [id]: false }));
  };

  const undo = async (row) => {
    const id = row.cloverItemId;
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await api.post("/admin/barcodes/undo", { cloverItemId: id });
      setSession((s) => s.filter((x) => x.row.cloverItemId !== id));
      if (!items.some((i) => i.cloverItemId === id)) await load();
      setMsg(id, "ok", "Barcode removed from Clover. The item is back on the list.");
    } catch (e) { setMsg(id, "err", errText(e)); }
    setBusy((b) => ({ ...b, [id]: false }));
  };

  const ignore = async (row, ignored) => {
    const id = row.cloverItemId;
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await api.post("/admin/barcodes/ignore", { cloverItemId: id, name: row.name, ignored });
      setData((d) => ({ ...d, items: d.items.map((i) => (i.cloverItemId === id ? { ...i, ignored } : i)) }));
    } catch (e) { setMsg(id, "err", errText(e)); }
    setBusy((b) => ({ ...b, [id]: false }));
  };

  const storeCode = async (row) => {
    const id = row.cloverItemId;
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      const { data: d } = await api.post("/admin/barcodes/store-code");
      setCodes((c) => ({ ...c, [id]: d.code }));
      setMsg(id, "ok", "Store barcode ready. Press Save, then print its label from the Fixed tab.");
      inputs.current[id]?.focus();
    } catch (e) { setMsg(id, "err", errText(e)); }
    setBusy((b) => ({ ...b, [id]: false }));
  };

  const csv = () => {
    const head = ["Name", "Category", "Brand", "Stock", "Price", "Sold last 4 weeks", "Clover ID", "SKU", "Barcode", "Status"];
    const status = (r) => (view === "done" ? "Fixed" : r.ignored ? "Doesn't need one" : r.hidden ? "Hidden in Clover" : "Missing");
    const lines = [head, ...list.map((r) => [r.name, r.category, r.brand, r.stock, r.price, r.sold28, r.cloverItemId, r.sku, r.barcode || "", status(r)])]
      .map((cols) => cols.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `missing-barcodes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const printChecklist = () => {
    const rows = list.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(title(r.category))}</td><td>${r.stock}</td><td style="font-family:monospace">${esc(r.cloverItemId)}</td><td style="width:180px">${esc(r.barcode || "")}</td></tr>`).join("");
    openPrint(`<h2>Missing barcodes · ${new Date().toLocaleDateString()}</h2><p>Write each barcode in the last column, then scan them in on the admin page.</p><table><tr><th>Item</th><th>Category</th><th>Stock</th><th>Clover ID</th><th>Barcode</th></tr>${rows}</table>`);
  };

  const printLabels = (rows) => {
    const labels = rows.filter((r) => /^\d{13}$/.test(r.barcode || "")).map((r) => `<div class="label"><div style="font-weight:bold;margin-bottom:4px">${esc(r.name)}</div>${ean13Svg(r.barcode)}</div>`).join("");
    if (!labels) return;
    openPrint(`<div class="labels">${labels}</div>`);
  };

  const pill = "inline-block px-2 py-0.5 rounded-full text-[11px] font-bold";
  const tabs = [["todo", "To fix"], ["instock", "In stock"], ["done", "Fixed"], ["ignored", "Not needed"], ["hidden", "Hidden in Clover"]];

  return (
    <section className="space-y-5" data-testid="missing-barcodes">
      <div>
        <h2 className="font-heading text-2xl flex items-center gap-2"><Barcode className="w-6 h-6" />Missing barcodes</h2>
        <p className="text-sm text-neutral-500 mt-1 max-w-3xl">Clover items that can't be scanned at the register. These get rung up as “Custom Item”, which hides what sold and throws off stock and the reorder list. Fix the best sellers first. This list is read live from Clover.</p>
      </div>

      {loadError && <p role="alert" className="text-sm text-red-700">{loadError} <button type="button" className="underline" onClick={load}>Try again</button></p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[["Missing", todo.length], ["In stock now", todo.filter((i) => i.stock > 0).length], ["Fixed now", session.length]].map(([label, n]) => (
          <div key={label} className="border rounded-2xl p-3 bg-white"><p className="text-[11px] uppercase tracking-wider font-bold text-neutral-500">{label}</p><p className="text-2xl font-bold tabular-nums">{loading ? "…" : n}</p></div>
        ))}
        <div className="border rounded-2xl p-3 bg-white">
          <p className="text-[11px] uppercase tracking-wider font-bold text-neutral-500">Progress</p>
          <p className="text-2xl font-bold tabular-nums">{loading ? "…" : `${pct}%`}</p>
          <div className="h-2 bg-neutral-100 rounded-full overflow-hidden mt-1"><div className="h-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} /></div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3 text-sm text-neutral-600">
        <div className="border rounded-2xl p-3 bg-white"><b className="block text-neutral-900">Has a barcode on the box?</b>Click the field and scan it with the USB scanner (or type the numbers). It saves when the scanner presses Enter.</div>
        <div className="border rounded-2xl p-3 bg-white"><b className="block text-neutral-900">No barcode on the item?</b>(glass, candles, loose items) Click “Make store barcode”, press Save, then print its label from the Fixed tab.</div>
        <div className="border rounded-2xl p-3 bg-white"><b className="block text-neutral-900">Never sold by scan?</b>Mark it “Doesn't need one” and it leaves the list. You can put it back any time.</div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <label className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, brand or Clover ID" className="w-full border rounded-xl pl-9 pr-3 py-2.5 text-sm" />
        </label>
        <div className="inline-flex border rounded-xl overflow-hidden bg-white flex-wrap" role="group" aria-label="Show">
          {tabs.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className={`px-3 py-2 text-sm font-semibold ${view === key ? "bg-emerald-700 text-white" : "text-neutral-600"}`}>{label}</button>
          ))}
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="border rounded-xl px-2 py-2.5 text-sm bg-white" aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{title(c)}</option>)}
        </select>
        {view !== "done" && (
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="border rounded-xl px-2 py-2.5 text-sm bg-white" aria-label="Sort">
            <option value="sales">Best sellers first</option>
            <option value="stock">Most stock first</option>
            <option value="name">Name A–Z</option>
            <option value="cat">Category</option>
          </select>
        )}
        <button type="button" onClick={load} className="border rounded-xl px-3 py-2.5 text-sm font-semibold bg-white flex items-center gap-1"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />Refresh</button>
        <button type="button" onClick={csv} disabled={!list.length} className="border rounded-xl px-3 py-2.5 text-sm font-semibold bg-white flex items-center gap-1 disabled:opacity-50"><Download className="w-4 h-4" />CSV</button>
        <button type="button" onClick={printChecklist} disabled={!list.length} className="border rounded-xl px-3 py-2.5 text-sm font-semibold bg-white flex items-center gap-1 disabled:opacity-50"><Printer className="w-4 h-4" />Print checklist</button>
        {view === "done" && <button type="button" onClick={() => printLabels(list)} disabled={!list.some((r) => /^20\d{11}$/.test(r.barcode || ""))} className="border rounded-xl px-3 py-2.5 text-sm font-semibold bg-white flex items-center gap-1 disabled:opacity-50"><Printer className="w-4 h-4" />Print store labels</button>}
      </div>

      <p className="text-sm font-semibold">{loading ? "Reading Clover…" : `${list.length} item${list.length === 1 ? "" : "s"}`}</p>

      <div className="space-y-2">
        {!loading && !list.length && <div className="border border-dashed rounded-2xl p-8 text-center text-neutral-500 bg-white">{view === "todo" ? "Every Clover item has a barcode. 🎉" : "Nothing here yet."}</div>}
        {list.map((r) => {
          const id = r.cloverItemId;
          const msg = msgs[id];
          const isDone = view === "done";
          return (
            <div key={id} className={`border rounded-2xl p-3 grid md:grid-cols-[1.6fr_.9fr_1.5fr] gap-3 items-center ${isDone ? "bg-emerald-50 border-emerald-300" : r.ignored ? "bg-white opacity-60" : "bg-white"}`} data-testid="barcode-row">
              <div className="min-w-0">
                <p className="font-bold leading-snug">{r.name}</p>
                <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1 text-xs text-neutral-500 items-center">
                  {r.category && <span className={`${pill} bg-neutral-100`}>{title(r.category)}</span>}
                  {r.stock <= 0 && <span className={`${pill} bg-red-50 text-red-700`}>Out of stock</span>}
                  {r.sold28 >= 10 && <span className={`${pill} bg-amber-50 text-amber-700`}>Best seller</span>}
                  {r.hidden && <span className={`${pill} bg-neutral-100`}>Hidden in Clover</span>}
                  {!r.productId && <span className={`${pill} bg-neutral-100`}>Not on website</span>}
                  {r.brand && <span>{title(r.brand)}</span>}
                  <span className="font-mono">Clover {id}</span>
                  {r.sku && <span className="font-mono">SKU {r.sku}</span>}
                </div>
              </div>
              <div className="text-sm text-neutral-500 tabular-nums">
                <div><b className="text-neutral-900">{r.stock}</b> in stock · ${Number(r.price || 0).toFixed(2)}</div>
                <div>Sold (4 wks): <b className="text-neutral-900">{r.sold28 || 0}</b></div>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                {isDone ? (
                  <>
                    <span className="font-mono font-bold">{r.barcode}</span>
                    <span className="text-xs text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />In Clover · scans at the register</span>
                    {/^20\d{11}$/.test(r.barcode || "") && <button type="button" className="text-xs underline" onClick={() => printLabels([r])}>Print label</button>}
                    <button type="button" className="text-xs underline text-neutral-500" disabled={busy[id]} onClick={() => undo(r)}>Undo</button>
                  </>
                ) : r.ignored ? (
                  <>
                    <span className="text-xs text-neutral-500">Marked “doesn't need a barcode”.</span>
                    <button type="button" className="text-xs underline" disabled={busy[id]} onClick={() => ignore(r, false)}>Put back on the list</button>
                  </>
                ) : (
                  <>
                    <input
                      ref={(el) => { inputs.current[id] = el; }}
                      value={codes[id] || ""}
                      onChange={(e) => { setCodes((c) => ({ ...c, [id]: e.target.value })); if (msg) setMsg(id, "", ""); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(r); } }}
                      placeholder="Scan or type barcode" inputMode="numeric" autoComplete="off" aria-label={`Barcode for ${r.name}`}
                      className="flex-1 min-w-[150px] border rounded-xl px-3 py-2 font-mono text-sm" data-testid="barcode-input" />
                    <button type="button" onClick={() => save(r)} disabled={busy[id]} className="rounded-xl px-4 py-2 text-sm font-bold bg-emerald-700 text-white disabled:opacity-50">{busy[id] ? "Saving…" : "Save"}</button>
                    <div className="w-full flex flex-wrap gap-3 text-xs">
                      <button type="button" className="underline text-neutral-500" disabled={busy[id]} onClick={() => storeCode(r)}>Make store barcode</button>
                      <button type="button" className="underline text-neutral-500" disabled={busy[id]} onClick={() => ignore(r, true)}>Doesn't need one</button>
                    </div>
                  </>
                )}
                {msg && <p role="status" className={`w-full text-xs ${msg.kind === "err" ? "text-red-700" : msg.kind === "warn" ? "text-amber-700" : "text-emerald-700"}`}>{msg.text}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default MissingBarcodes;
