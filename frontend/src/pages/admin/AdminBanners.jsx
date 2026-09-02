import React, { useEffect, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, Save, Image as ImageIcon } from "lucide-react";
import api, { imgUrl } from "../../api";
import { useCatalog } from "../../context/CatalogContext";
import { useToast } from "../../hooks/use-toast";
import { ImageField } from "./ProductForm";

const inputCls = "w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 transition-colors";
const Label = ({ children }) => <label className="block text-[11px] font-bold uppercase tracking-wide text-neutral-500 mb-1">{children}</label>;

const move = (arr, i, d) => {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const copy = [...arr];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
};

const AdminBanners = () => {
  const { home, products, refresh } = useCatalog();
  const { toast } = useToast();
  const [slides, setSlides] = useState([]);
  const [tiles, setTiles] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSlides(home.heroSlides);
    setTiles(home.promoBlocks);
  }, [home]);

  const setSlide = (i, k, v) => setSlides((prev) => prev.map((s, idx) => (idx === i ? { ...s, [k]: v } : s)));
  const setTile = (i, k, v) => setTiles((prev) => prev.map((t, idx) => (idx === i ? { ...t, [k]: v } : t)));
  const nextId = (arr) => Math.max(0, ...arr.map((x) => x.id)) + 1;

  const save = async () => {
    if (slides.length === 0) return toast({ title: "Add at least one hero slide", variant: "destructive" });
    if (slides.some((s) => !s.title || !s.image)) return toast({ title: "Every hero slide needs a title and an image", variant: "destructive" });
    setBusy(true);
    try {
      await api.put("/admin/content/home", {
        heroSlides: slides,
        promoBlocks: tiles.map((t) => ({ ...t, productId: t.productId ? Number(t.productId) : null })),
      });
      await refresh();
      toast({ title: "Home page updated", description: "Your banners are live." });
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast({ title: "Save failed", description: Array.isArray(d) ? d.map((x) => x.msg).join(", ") : d || "Try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="admin-banners">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-heading text-3xl uppercase tracking-tight">Home Banners</h1>
          <p className="text-sm text-neutral-500">Hero slider and the four promo tiles on the home page.</p>
        </div>
        <button onClick={save} disabled={busy} data-testid="banners-save" className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-full hover:bg-emerald-700 disabled:opacity-60"><Save className="h-4 w-4" /> {busy ? "Saving..." : "Publish Changes"}</button>
      </div>

      <section className="mb-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-xl uppercase tracking-wide">Hero Slider <span className="text-neutral-400 text-base">({slides.length})</span></h2>
          <button onClick={() => setSlides((p) => [...p, { id: nextId(p), image: "", tag: "Puff2Door", title: "", subtitle: "", cta: "Shop Now", link: "/shop" }])} data-testid="add-hero-slide" className="inline-flex items-center gap-1 text-sm font-bold text-emerald-600 hover:underline"><Plus className="h-4 w-4" /> Add slide</button>
        </div>
        <div className="space-y-4">
          {slides.map((s, i) => (
            <div key={s.id} data-testid={`hero-slide-editor-${s.id}`} className="border border-neutral-200 rounded-2xl p-5 grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5">
              <div className="space-y-3">
                <div><Label>Headline *</Label><input data-testid={`hero-title-${s.id}`} className={inputCls} value={s.title} onChange={(e) => setSlide(i, "title", e.target.value)} /></div>
                <div><Label>Subtitle</Label><input className={inputCls} value={s.subtitle} onChange={(e) => setSlide(i, "subtitle", e.target.value)} /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Small tag</Label><input className={inputCls} value={s.tag} onChange={(e) => setSlide(i, "tag", e.target.value)} /></div>
                  <div><Label>Button text</Label><input className={inputCls} value={s.cta} onChange={(e) => setSlide(i, "cta", e.target.value)} /></div>
                  <div><Label>Button link</Label><input className={inputCls} placeholder="/shop/..." value={s.link} onChange={(e) => setSlide(i, "link", e.target.value)} /></div>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <ImageField label="Banner image (wide, ~1536×1024)" value={s.image} onChange={(v) => setSlide(i, "image", v)} testId={`hero-image-${s.id}`} />
                <div className="flex gap-1 mt-auto justify-end">
                  <button onClick={() => setSlides((p) => move(p, i, -1))} className="h-8 w-8 grid place-items-center rounded-full hover:bg-neutral-100" aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
                  <button onClick={() => setSlides((p) => move(p, i, 1))} className="h-8 w-8 grid place-items-center rounded-full hover:bg-neutral-100" aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
                  <button onClick={() => setSlides((p) => p.filter((_, idx) => idx !== i))} data-testid={`hero-remove-${s.id}`} className="h-8 w-8 grid place-items-center rounded-full hover:bg-red-50 text-red-500" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-xl uppercase tracking-wide">Promo Tiles <span className="text-neutral-400 text-base">({tiles.length})</span></h2>
          <button onClick={() => setTiles((p) => [...p, { id: nextId(p), productId: null, tag: "", label: "", image: "", link: "" }])} data-testid="add-promo-tile" className="inline-flex items-center gap-1 text-sm font-bold text-emerald-600 hover:underline"><Plus className="h-4 w-4" /> Add tile</button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">Pick a product and the tile uses its photo, name, price and link automatically — or leave it blank and set a custom image, label and link.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tiles.map((t, i) => {
            const pr = t.productId ? products.find((p) => p.id === Number(t.productId)) : null;
            const preview = t.image || pr?.image;
            return (
              <div key={t.id} data-testid={`promo-tile-editor-${t.id}`} className="border border-neutral-200 rounded-2xl p-5 space-y-3">
                <div className="flex gap-4">
                  <div className="h-20 w-20 shrink-0 rounded-xl bg-neutral-50 border grid place-items-center p-1">{preview ? <img src={imgUrl(preview)} alt="" className="max-h-full max-w-full object-contain" /> : <ImageIcon className="h-6 w-6 text-neutral-300" />}</div>
                  <div className="flex-1 space-y-2">
                    <div><Label>Product</Label>
                      <select data-testid={`promo-product-${t.id}`} className={inputCls} value={t.productId || ""} onChange={(e) => setTile(i, "productId", e.target.value ? Number(e.target.value) : null)}>
                        <option value="">— Custom tile (no product) —</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div><Label>Corner tag</Label><input data-testid={`promo-tag-${t.id}`} className={inputCls} placeholder="e.g. Best Seller" value={t.tag} onChange={(e) => setTile(i, "tag", e.target.value)} /></div>
                  </div>
                </div>
                {!t.productId && (
                  <div className="space-y-3 border-t pt-3">
                    <div><Label>Label</Label><input className={inputCls} value={t.label} onChange={(e) => setTile(i, "label", e.target.value)} /></div>
                    <div><Label>Link</Label><input className={inputCls} placeholder="/product-category/kratom" value={t.link} onChange={(e) => setTile(i, "link", e.target.value)} /></div>
                    <ImageField label="Tile image" value={t.image} onChange={(v) => setTile(i, "image", v)} testId={`promo-image-${t.id}`} />
                  </div>
                )}
                <div className="flex justify-end gap-1">
                  <button onClick={() => setTiles((p) => move(p, i, -1))} className="h-8 w-8 grid place-items-center rounded-full hover:bg-neutral-100" aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
                  <button onClick={() => setTiles((p) => move(p, i, 1))} className="h-8 w-8 grid place-items-center rounded-full hover:bg-neutral-100" aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
                  <button onClick={() => setTiles((p) => p.filter((_, idx) => idx !== i))} data-testid={`promo-remove-${t.id}`} className="h-8 w-8 grid place-items-center rounded-full hover:bg-red-50 text-red-500" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default AdminBanners;
