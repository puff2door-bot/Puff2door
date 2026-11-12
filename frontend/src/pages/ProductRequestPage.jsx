import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, PackageSearch } from "lucide-react";
import api from "../api";
import { useApp } from "../context/AppContext";
import { useToast } from "../hooks/use-toast";
import Seo from "../seo/Seo";

const blank = { productName: "", brand: "", flavor: "", size: "", email: "", phone: "", notes: "" };

export default function ProductRequestPage() {
  const { user } = useApp();
  const { toast } = useToast();
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  useEffect(() => {
    if (user) setForm((value) => ({ ...value, email: value.email || user.email || "", phone: value.phone || user.phone || "" }));
  }, [user]);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      const { data } = await api.post("/product-requests", form);
      setSubmitted(data); setForm((value) => ({ ...blank, email: value.email, phone: value.phone }));
    } catch (error) {
      toast({ title: "Could not send request", description: error?.response?.data?.detail || "Please try again.", variant: "destructive" });
    } finally { setBusy(false); }
  };
  return <div className="max-w-3xl mx-auto px-4 py-12">
    <Seo noindex title="Request a Product | HD Smoke Shop" description="Ask HD Smoke Shop to carry a product." />
    <div className="text-center mb-8"><PackageSearch className="h-12 w-12 text-emerald-600 mx-auto mb-3" /><h1 className="font-heading text-4xl uppercase">Request a Product</h1><p className="text-neutral-500 mt-2">Can’t find what you want? Tell us the brand, flavor, or exact item. We’ll review it and keep your request in the admin system.</p></div>
    {submitted && <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800"><p className="font-bold flex gap-2"><CheckCircle2 className="h-5 w-5" /> Request received</p><p className="text-sm mt-1">Reference {submitted.id.slice(0, 8)}. We’ll use your email or phone if we need more details.</p></div>}
    <form onSubmit={submit} className="rounded-2xl border p-6 sm:p-8 space-y-5">
      <label className="block text-sm font-bold">Product name *<input required value={form.productName} onChange={(e) => set("productName", e.target.value)} className="mt-1.5 w-full rounded-lg border px-4 py-3 font-normal" placeholder="Example: Geek Bar Pulse X Blue Rancher" /></label>
      <div className="grid sm:grid-cols-3 gap-4">
        <label className="text-sm font-bold">Brand<input value={form.brand} onChange={(e) => set("brand", e.target.value)} className="mt-1.5 w-full rounded-lg border px-3 py-2.5 font-normal" /></label>
        <label className="text-sm font-bold">Flavor<input value={form.flavor} onChange={(e) => set("flavor", e.target.value)} className="mt-1.5 w-full rounded-lg border px-3 py-2.5 font-normal" /></label>
        <label className="text-sm font-bold">Size / strength<input value={form.size} onChange={(e) => set("size", e.target.value)} className="mt-1.5 w-full rounded-lg border px-3 py-2.5 font-normal" /></label>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="text-sm font-bold">Email *<input required type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="mt-1.5 w-full rounded-lg border px-3 py-2.5 font-normal" /></label>
        <label className="text-sm font-bold">Phone<input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="mt-1.5 w-full rounded-lg border px-3 py-2.5 font-normal" /></label>
      </div>
      <label className="block text-sm font-bold">Anything else?<textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows="4" className="mt-1.5 w-full rounded-lg border px-4 py-3 font-normal" placeholder="Package color, quantity, link, or other details" /></label>
      <button disabled={busy} className="w-full rounded-full bg-emerald-600 px-6 py-3 text-white font-bold disabled:opacity-50">{busy ? "Sending…" : "Send Product Request"}</button>
      <p className="text-center text-xs text-neutral-500">Product requests do not reserve stock or guarantee availability. All purchases remain 21+ where required.</p>
    </form>
    <p className="text-center mt-6 text-sm"><Link to="/shop" className="font-bold text-emerald-700 hover:underline">Back to shop</Link></p>
  </div>;
}
