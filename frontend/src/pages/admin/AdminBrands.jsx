import React, { useState } from "react";
import { Tag, Trash2, Loader2, Save } from "lucide-react";
import api, { imgUrl } from "../../api";
import { useCatalog } from "../../context/CatalogContext";
import { useToast } from "../../hooks/use-toast";
import { ImageField } from "./ProductForm";

const BrandRow = ({ brand, onSaved }) => {
  const [image, setImage] = useState(brand.customImage || "");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const dirty = image !== (brand.customImage || "");

  const save = async () => {
    setBusy(true);
    try {
      let saved = "";
      if (image && /^https?:\/\//.test(image) && !image.includes("/api/files/")) {
        saved = (await api.post(`/admin/brands/${brand.slug}/import`, { image, name: brand.name })).data.image;
      } else if (image) {
        saved = (await api.put(`/admin/brands/${brand.slug}`, { image, name: brand.name })).data.image;
      } else {
        await api.delete(`/admin/brands/${brand.slug}`);
      }
      onSaved(brand.slug, saved);
      toast({ title: image ? "Logo saved" : "Custom logo removed", description: brand.name });
    } catch (e) {
      toast({ title: "Save failed", description: e?.response?.data?.detail || "Try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid={`brand-row-${brand.slug}`} className="grid grid-cols-1 md:grid-cols-[200px_1fr_auto] gap-4 items-center border border-neutral-200 rounded-xl p-4 bg-white">
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 rounded-lg border border-neutral-200 bg-neutral-50 grid place-items-center overflow-hidden shrink-0">
          {brand.image ? <img src={imgUrl(brand.image)} alt="" className="h-full w-full object-contain p-1" /> : <Tag className="h-5 w-5 text-neutral-300" />}
        </div>
        <div>
          <p className="font-heading text-base uppercase leading-tight" data-testid={`brand-row-name-${brand.slug}`}>{brand.name}</p>
          <p className="text-xs text-neutral-500">{brand.count} product{brand.count === 1 ? "" : "s"} · {brand.customImage ? "custom logo" : brand.image ? "default logo" : "no logo (text)"}</p>
        </div>
      </div>
      <ImageField label="Brand logo" value={image} onChange={setImage} testId={`brand-logo-${brand.slug}`} />
      <div className="flex md:flex-col gap-2">
        <button type="button" disabled={busy || !dirty} onClick={save} data-testid={`brand-save-${brand.slug}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-full hover:bg-emerald-700 disabled:opacity-40 transition-colors">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
        </button>
        {brand.customImage && (
          <button type="button" disabled={busy} onClick={() => setImage("")} data-testid={`brand-reset-${brand.slug}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-red-200 text-red-600 text-xs font-bold rounded-full hover:bg-red-50 transition-colors">
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        )}
      </div>
    </div>
  );
};

const AdminBrands = () => {
  const { activeBrands, brandLogos, setBrandLogos, loading } = useCatalog();
  const [q, setQ] = useState("");
  const list = activeBrands.filter((b) => b.name.toLowerCase().includes(q.toLowerCase()));
  const withLogo = activeBrands.filter((b) => b.image).length;

  const onSaved = (slug, image) => {
    setBrandLogos((prev) => {
      const rest = prev.filter((l) => l.slug !== slug);
      return image ? [...rest, { slug, image, name: activeBrands.find((b) => b.slug === slug)?.name || slug }] : rest;
    });
  };

  return (
    <div data-testid="admin-brands">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-3xl uppercase tracking-tight">Brand Logos</h1>
          <p className="text-sm text-neutral-500 mt-1">Brands come from your products automatically. Upload an official logo for each one — {withLogo} of {activeBrands.length} currently have a logo.</p>
        </div>
        <input data-testid="brand-search" placeholder="Search brands…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-64 border border-neutral-300 rounded-full px-4 py-2 text-sm outline-none focus:border-emerald-600" />
      </div>
      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-3">
          {list.map((b) => <BrandRow key={`${b.slug}-${brandLogos.find((l) => l.slug === b.slug)?.image || ""}`} brand={b} onSaved={onSaved} />)}
        </div>
      )}
    </div>
  );
};

export default AdminBrands;
