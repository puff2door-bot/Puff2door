import React, { useEffect, useState } from "react";
import { Star, Trash2, ExternalLink } from "lucide-react";
import api from "../../api";

// Real 5-star Google reviews for the website. Copy them in by hand until Google approves API access;
// after that they arrive automatically. Shown with first name + last initial only.
const thisMonth = () => new Date().toLocaleDateString("en-CA").slice(0, 7);

const AdminReviews = () => {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ name: "", comment: "", month: thisMonth() });
  const [sum, setSum] = useState({ averageRating: "", totalReviewCount: "", homepageReviewCount: 3 });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/admin/reviews").then(({ data: d }) => {
    setData(d);
    setSum({ averageRating: d.averageRating ?? "", totalReviewCount: d.totalReviewCount ?? "", homepageReviewCount: d.homepageReviewCount ?? 3 });
  }).catch(() => setMsg("Could not load reviews."));
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg("");
    try { await api.post("/admin/reviews", form); setForm({ name: "", comment: "", month: form.month }); setMsg("Added."); await load(); }
    catch (err) { setMsg(err?.response?.data?.detail?.[0]?.msg || err?.response?.data?.detail || "Could not add that review."); }
    setBusy(false);
  };
  const remove = async (id) => { if (!window.confirm("Remove this review from the website?")) return; await api.delete(`/admin/reviews/${id}`); load(); };
  const saveSum = async () => {
    setBusy(true);
    try {
      await api.put("/admin/reviews/summary", { averageRating: sum.averageRating === "" ? null : Number(sum.averageRating),
        totalReviewCount: sum.totalReviewCount === "" ? null : Number(sum.totalReviewCount),
        homepageReviewCount: Number(sum.homepageReviewCount) });
      setMsg("Review settings saved."); await load();
    } catch { setMsg("Check the rating and homepage review count."); }
    setBusy(false);
  };
  const toggle = async (on) => { await api.post("/admin/google/reviews-on-site", { on }); load(); };

  if (!data) return <p className="text-neutral-500">{msg || "Loading…"}</p>;
  const input = "border rounded-xl px-3 py-2 text-sm w-full";
  return (
    <section className="space-y-5" data-testid="admin-reviews">
      <div>
        <h1 className="font-heading text-3xl uppercase tracking-tight flex items-center gap-2"><Star className="w-7 h-7 text-amber-500" />Reviews</h1>
        <p className="text-sm text-neutral-500">Real 5-star Google reviews shown on the homepage and Delivery page. Copy them exactly as the customer wrote them on Google. Never make one up.
          {data.googleConnected ? " Google is connected, so new ones also arrive automatically." : " Once Google approves API access, new ones will arrive automatically."}</p>
      </div>

      <div className="rounded-2xl border p-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 font-semibold"><input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={data.onSite} onChange={(e) => toggle(e.target.checked)} />Show on website</label>
        <span className="text-sm text-neutral-500 flex-1">{data.onSite ? "Customers can see these now." : "Hidden from customers. Use Preview to check first."}</span>
        <a href="/?reviewPreview=1" target="_blank" rel="noreferrer" className="text-sm underline flex items-center gap-1">Preview homepage <ExternalLink className="h-3.5 w-3.5" /></a>
        <a href="/delivery-area?reviewPreview=1" target="_blank" rel="noreferrer" className="text-sm underline flex items-center gap-1">Preview Delivery page <ExternalLink className="h-3.5 w-3.5" /></a>
      </div>

      <div className="rounded-2xl border p-4 grid sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
        <label className="text-xs text-neutral-500">Your Google rating (as shown on Google)<input className={input} type="number" min="1" max="5" step="0.1" value={sum.averageRating} onChange={(e) => setSum({ ...sum, averageRating: e.target.value })} placeholder="e.g. 4.8" /></label>
        <label className="text-xs text-neutral-500">Number of Google reviews<input className={input} type="number" min="0" value={sum.totalReviewCount} onChange={(e) => setSum({ ...sum, totalReviewCount: e.target.value })} placeholder="e.g. 120" /></label>
        <label className="text-xs text-neutral-500">Reviews shown on homepage<input className={input} type="number" min="1" max="12" value={sum.homepageReviewCount} onChange={(e) => setSum({ ...sum, homepageReviewCount: e.target.value })} /></label>
        <button type="button" onClick={saveSum} disabled={busy} className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50">Save settings</button>
      </div>

      <form onSubmit={add} className="rounded-2xl border p-4 space-y-3">
        <p className="font-semibold">Add a 5-star review from Google</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs text-neutral-500">Customer name on Google (only first name + last initial will show)<input className={input} required maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Maria Gonzalez" /></label>
          <label className="text-xs text-neutral-500">Month written<input className={input} type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} /></label>
        </div>
        <label className="text-xs text-neutral-500 block">Review text, word for word<textarea className={input} required minLength={10} maxLength={1200} rows={3} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="Paste the review exactly as it appears on Google" /></label>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className="rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Add review</button>
          {msg && <span role="status" className="text-sm text-neutral-600">{msg}</span>}
        </div>
      </form>

      <div className="space-y-2">
        <p className="text-sm font-semibold">{data.reviews.length} review(s) on file · the newest {data.homepageReviewCount ?? 3} show on the homepage</p>
        {data.reviews.map((r) => (
          <div key={r.reviewId} className="rounded-xl border p-3 flex gap-3">
            <div className="flex-1 text-sm"><p className="text-amber-500">★★★★★</p><p className="text-neutral-700">“{r.comment}”</p>
              <p className="text-xs text-neutral-500 mt-1"><b>{r.name}</b> · {r.createTime?.slice(0, 7)} · {r.source === "manual" ? "added by you" : "from Google"}</p></div>
            <button type="button" onClick={() => remove(r.reviewId)} aria-label="Remove review" className="text-red-600 self-start"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </section>
  );
};

export default AdminReviews;
