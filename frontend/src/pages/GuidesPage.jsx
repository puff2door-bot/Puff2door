import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BookOpen, Clock, ChevronRight } from "lucide-react";
import api from "../api";
import Seo from "../seo/Seo";
import { breadcrumbJsonLd } from "../seo/config";

const fmtDate = (d) => {
  try { return new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); } catch { return d; }
};

export const GuidesIndex = () => {
  const [guides, setGuides] = useState(null);
  useEffect(() => { api.get("/guides").then(({ data }) => setGuides(data.guides || [])).catch(() => setGuides([])); }, []);
  return (
    <div className="max-w-[1100px] mx-auto px-4 py-10">
      <Seo
        title="Smoke Shop Guides: Vapes, Hookah, Papers & Glass | HD Smoke Shop"
        description="Plain-English buying and how-to guides from HD Smoke Shop in Altamonte Springs: choosing a disposable vape, hookah for beginners, papers vs cones, and cleaning glass."
        path="/guides"
        jsonLd={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Guides", path: "/guides" }])}
      />
      <div className="relative overflow-hidden rounded-xl bg-neutral-900 px-8 py-10 mb-8">
        <div className="absolute -right-10 -bottom-16 h-56 w-56 rounded-full bg-emerald-600/20 blur-2xl" />
        <h1 className="font-heading text-3xl sm:text-4xl text-white uppercase tracking-tight relative">Smoke Shop Guides</h1>
        <p className="text-neutral-400 text-sm mt-1 relative">Straight answers from the counter at HD Smoke Shop, Altamonte Springs.</p>
      </div>
      {guides === null ? (
        <p className="text-neutral-500">Loading guides...</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4" data-testid="guides-list">
          {guides.map((g) => (
            <Link key={g.slug} to={`/guides/${g.slug}`} className="group flex flex-col gap-2 bg-white border border-neutral-200 rounded-xl p-6 hover:border-emerald-300 hover:shadow-lg transition-all">
              <BookOpen className="h-5 w-5 text-emerald-600" />
              <h2 className="font-heading text-xl uppercase tracking-tight group-hover:text-emerald-700">{g.title}</h2>
              <p className="text-sm text-neutral-600 leading-relaxed">{g.description}</p>
              <span className="mt-auto pt-2 inline-flex items-center gap-1.5 text-xs text-neutral-500"><Clock className="h-3.5 w-3.5" />{g.readMinutes} min read</span>
            </Link>
          ))}
        </div>
      )}
      <section className="mt-10 text-sm leading-relaxed text-neutral-600 max-w-3xl" data-testid="guides-about">
        <h2 className="font-heading text-xl uppercase text-neutral-900 mb-2">Why we wrote these guides</h2>
        <p>Our staff answer the same questions at the counter every day: how to choose a disposable vape, how to set up a hookah, the difference between papers and cones, how to clean glass, and what to bring for ID. These guides put those answers in one place, written by the team at our Altamonte Springs store on SR 434. They are general information only, not medical or legal advice, and every product we sell is for adults 21 and older.</p>
        <p className="mt-3">Have a question we haven't covered? Call us at <a href="tel:+14076256826" className="text-emerald-700 underline">(407) 625-6826</a> or stop by any day from 10 AM to 10 PM, and we'll help you find the right product.</p>
      </section>
    </div>
  );
};

export const GuideArticle = () => {
  const { slug } = useParams();
  const [g, setG] = useState(null);
  const [missing, setMissing] = useState(false);
  const [others, setOthers] = useState([]);
  useEffect(() => {
    setG(null); setMissing(false);
    api.get(`/guides/${slug}`).then(({ data }) => setG(data)).catch(() => setMissing(true));
    api.get("/guides").then(({ data }) => setOthers((data.guides || []).filter((x) => x.slug !== slug))).catch(() => {});
    window.scrollTo(0, 0);
  }, [slug]);

  if (missing) {
    return (
      <div className="max-w-[760px] mx-auto px-4 py-16 text-center">
        <Seo title="Guide not found | HD Smoke Shop" description="This guide doesn't exist." path={`/guides/${slug}`} noindex />
        <h1 className="font-heading text-3xl uppercase">Guide not found</h1>
        <Link to="/guides" className="inline-block mt-4 font-bold text-emerald-700 hover:underline">See all guides</Link>
      </div>
    );
  }
  if (!g) return <div className="max-w-[760px] mx-auto px-4 py-16 text-neutral-500">Loading guide...</div>;

  return (
    <article className="max-w-[760px] mx-auto px-4 py-10" data-testid="guide-article">
      <Seo
        title={g.metaTitle}
        description={g.description}
        path={`/guides/${g.slug}`}
        type="article"
        jsonLd={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Guides", path: "/guides" }, { name: g.title, path: `/guides/${g.slug}` }])}
      />
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-neutral-500 mb-4">
        <Link to="/" className="hover:text-emerald-700">Home</Link><ChevronRight className="h-3 w-3" />
        <Link to="/guides" className="hover:text-emerald-700">Guides</Link>
      </nav>
      <h1 className="font-heading text-3xl sm:text-4xl uppercase tracking-tight text-balance">{g.title}</h1>
      <p className="mt-2 text-xs text-neutral-500">Updated {fmtDate(g.updated)} · {g.readMinutes} min read · HD Smoke Shop, Altamonte Springs</p>
      <p className="mt-5 text-lg text-neutral-700 leading-relaxed">{g.intro}</p>

      {g.sections.map((sec) => (
        <section key={sec.h} className="mt-8">
          <h2 className="font-heading text-2xl uppercase tracking-tight mb-3">{sec.h}</h2>
          {(sec.p || []).map((t, i) => <p key={i} className="text-neutral-700 leading-relaxed mb-3">{t}</p>)}
          {sec.list && (
            <ul className="space-y-2">
              {sec.list.map((t, i) => (
                <li key={i} className="flex gap-3 text-neutral-700 leading-relaxed"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0" />{t}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <section className="mt-10 rounded-xl bg-emerald-50 border border-emerald-100 p-5">
        <h2 className="font-heading text-lg uppercase tracking-tight mb-3">Shop</h2>
        <div className="flex flex-wrap gap-2">
          {g.links.map((l) => (
            <Link key={l.href} to={l.href} className="px-3.5 py-2 rounded-full bg-white border border-emerald-200 text-sm font-semibold text-emerald-800 hover:bg-emerald-600 hover:text-white transition-colors">{l.label}</Link>
          ))}
        </div>
        <p className="mt-3 text-xs text-neutral-600">Adults 21+ only. Valid photo ID required in store and at delivery.</p>
      </section>

      {others.length > 0 && (
        <section className="mt-10">
          <h2 className="font-heading text-lg uppercase tracking-tight mb-3">More guides</h2>
          <ul className="space-y-2">
            {others.map((o) => (
              <li key={o.slug}><Link to={`/guides/${o.slug}`} className="font-semibold text-emerald-700 hover:underline">{o.title}</Link></li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
};
