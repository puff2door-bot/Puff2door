import React, { useEffect, useState, useCallback } from "react";
import { Star, MessageSquare } from "lucide-react";
import api from "../api";
import { useToast } from "../hooks/use-toast";

const StarRow = ({ value, size = "h-4 w-4", onSelect }) => (
  <div className="flex">
    {Array.from({ length: 5 }).map((_, i) => (
      <button
        key={i}
        type={onSelect ? "button" : undefined}
        disabled={!onSelect}
        data-testid={onSelect ? `review-star-${i + 1}` : undefined}
        onClick={onSelect ? () => onSelect(i + 1) : undefined}
        className={onSelect ? "p-0.5" : ""}
      >
        <Star className={`${size} ${i < Math.round(value) ? "fill-amber-400 text-amber-400" : "text-neutral-300"}`} />
      </button>
    ))}
  </div>
);

const ReviewsSection = ({ productSlug, onSummary }) => {
  const { toast } = useToast();
  const [data, setData] = useState({ reviews: [], average: 0, count: 0 });
  const [form, setForm] = useState({ name: "", rating: 0, comment: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/reviews/${productSlug}`);
      setData(res.data);
      onSummary && onSummary(res.data);
    } catch {/* ignore */}
  }, [productSlug, onSummary]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.rating) { toast({ title: "Pick a rating", variant: "destructive" }); return; }
    setBusy(true);
    try {
      await api.post("/reviews", { productSlug, name: form.name || "Anonymous", rating: form.rating, comment: form.comment });
      toast({ title: "Review posted", description: "Thanks for your feedback!" });
      setForm({ name: "", rating: 0, comment: "" });
      load();
    } catch {
      toast({ title: "Could not post review", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const inputCls = "w-full border border-neutral-300 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-emerald-600 transition-colors";

  return (
    <section className="pt-16">
      <h2 className="font-heading text-2xl sm:text-3xl font-700 uppercase tracking-tight mb-6 flex items-center gap-2">
        <MessageSquare className="h-6 w-6 text-emerald-600" /> Customer Reviews
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-10">
        {/* Summary + form */}
        <div>
          <div className="border border-neutral-200 rounded-xl p-6 text-center mb-6">
            <p className="font-heading text-5xl text-neutral-900">{data.average || 0}</p>
            <div className="flex justify-center my-2"><StarRow value={data.average} size="h-5 w-5" /></div>
            <p className="text-sm text-neutral-500">{data.count} review{data.count === 1 ? "" : "s"}</p>
          </div>
          <form onSubmit={submit} data-testid="review-form" className="border border-neutral-200 rounded-xl p-6 space-y-3">
            <h3 className="font-heading text-lg uppercase tracking-wide">Write a Review</h3>
            <div>
              <label className="block text-xs font-medium mb-1.5 text-neutral-500">Your Rating</label>
              <StarRow value={form.rating} size="h-7 w-7" onSelect={(r) => setForm({ ...form, rating: r })} />
            </div>
            <input data-testid="review-name" className={inputCls} placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <textarea rows={3} data-testid="review-comment" className={inputCls} placeholder="Share your thoughts..." value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
            <button disabled={busy} data-testid="review-submit" className="w-full py-2.5 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors disabled:opacity-60">{busy ? "Posting..." : "Submit Review"}</button>
          </form>
        </div>

        {/* List */}
        <div>
          {data.reviews.length === 0 ? (
            <div className="border border-dashed border-neutral-300 rounded-xl p-12 text-center text-neutral-500">
              No reviews yet. Be the first to review this product!
            </div>
          ) : (
            <div className="space-y-4">
              {data.reviews.map((r) => (
                <div key={r.id} className="border border-neutral-200 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="h-9 w-9 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center font-heading">{r.name.charAt(0).toUpperCase()}</span>
                      <div>
                        <p className="font-semibold text-sm">{r.name}</p>
                        <p className="text-[11px] text-neutral-400">{new Date(r.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <StarRow value={r.rating} />
                  </div>
                  {r.comment && <p className="text-sm text-neutral-600 leading-relaxed">{r.comment}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default ReviewsSection;
