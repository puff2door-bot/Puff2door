import React, { useEffect, useState } from "react";
import { Star } from "lucide-react";
import api from "../api";

// Real 5-star reviews copied from the shop's Google Business Profile (first name + last initial only).
const Stars = ({ n = 5 }) => <span className="flex gap-0.5" aria-label={`${n} out of 5 stars`}>{Array.from({ length: 5 }, (_, i) => <Star key={i} className={`h-4 w-4 ${i < n ? "fill-amber-400 text-amber-400" : "text-neutral-300"}`} />)}</span>;
const month = (iso) => { try { return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" }); } catch { return ""; } };

const GoogleReviews = ({ reviewUrl, fallback }) => {
  const [data, setData] = useState(null);
  useEffect(() => {
    const preview = new URLSearchParams(window.location.search).get("reviewPreview") === "1";
    api.get("/reviews/google", { params: preview ? { preview: true } : {} }).then(({ data: d }) => setData(d)).catch(() => setData({ show: false }));
  }, []);
  if (!data) return null;
  if (!data.show || !data.reviews?.length) return fallback;
  return (
    <div className="space-y-4" data-testid="google-reviews">
      {data.averageRating ? <p className="flex items-center gap-2 text-sm text-neutral-600"><Stars n={Math.round(data.averageRating)} />
        <b className="text-neutral-900">{Number(data.averageRating).toFixed(1)}</b> on Google{data.total ? ` · ${data.total} reviews` : ""}</p> : null}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.reviews.map((r, i) => (
          <figure key={i} className="border border-neutral-200 rounded-2xl p-5 bg-white flex flex-col gap-3">
            <Stars n={r.stars} />
            <blockquote className="text-sm text-neutral-700 leading-relaxed line-clamp-6">“{r.comment}”</blockquote>
            <figcaption className="mt-auto text-xs text-neutral-500"><b className="text-neutral-800">{r.name}</b> · Google review{r.createTime ? ` · ${month(r.createTime)}` : ""}</figcaption>
          </figure>
        ))}
      </div>
      {reviewUrl && <a href={reviewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">Read all reviews on Google</a>}
    </div>
  );
};

export default GoogleReviews;
