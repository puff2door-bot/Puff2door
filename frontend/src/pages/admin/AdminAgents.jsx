import React, { useEffect, useMemo, useState } from "react";
import {
  Activity, Bot, Camera, CheckCircle2, ChevronRight, CirclePause, CirclePlay,
  ClipboardCheck, Globe2, HeartHandshake, Image, Megaphone, PackageSearch,
  RefreshCw, Route, ShieldCheck, Sparkles, Store, Truck, Users, Zap,
  Share2,
} from "lucide-react";
import api from "../../api";

const schedules = [
  { id: "website", name: "Website health and public endpoints", every: "15 minutes", icon: Globe2 },
  { id: "inventory", name: "Low-stock and reorder suggestions", every: "4 hours", icon: PackageSearch },
  { id: "catalog", name: "Public catalog completeness", every: "6 hours", icon: Store },
  { id: "seo", name: "SEO and website basics", every: "6 hours", icon: Megaphone },
  { id: "briefing", name: "Owner daily briefing", every: "24 hours", icon: Sparkles },
  { id: "compliance", name: "Age, ID, category, and claim signals", every: "24 hours", icon: ShieldCheck },
  { id: "photos", name: "Missing and duplicate images", every: "24 hours", icon: Image },
  { id: "social", name: "Instagram + TikTok creative campaign", every: "24 hours", icon: Share2 },
];

const agentDefinitions = [
  { id: "operations", name: "Operations", description: "Catalog health, imports, Clover comparisons, and approved workflows.", icon: Bot, tone: "emerald" },
  { id: "marketing", name: "Marketing & presence", description: "SEO, listings, compliant content, and online visibility.", icon: Megaphone, tone: "violet" },
  { id: "briefing", name: "Owner briefing", description: "One summary of approvals, stock, photos, and urgent work.", icon: Sparkles, tone: "amber" },
  { id: "watchdog", name: "Website watchdog", description: "Domain, API, sitemap, robots, and response health.", icon: Globe2, tone: "sky" },
  { id: "reputation", name: "Review & reputation", description: "Review-response drafts with owner approval before posting.", icon: HeartHandshake, tone: "rose" },
  { id: "compliance", name: "Compliance guardian", description: "21+, ID, restricted-claim, and catalog policy signals.", icon: ShieldCheck, tone: "emerald" },
  { id: "inventory", name: "Inventory & reorder", description: "Low-stock signals and supplier reorder drafts—never orders.", icon: PackageSearch, tone: "orange" },
  { id: "photos", name: "Product photo agent", description: "Missing, placeholder, and duplicate public images.", icon: Camera, tone: "cyan" },
  { id: "support", name: "Customer support", description: "Verified answer drafts with uncertain questions escalated.", icon: Users, tone: "blue" },
  { id: "competitors", name: "Competitor watch", description: "Owner-supplied public snapshots without account access.", icon: Store, tone: "slate" },
  { id: "delivery", name: "Delivery readiness", description: "ZIP, age, ID, and payment readiness—never dispatches.", icon: Truck, tone: "lime" },
  { id: "social", name: "Daily social studio", description: "A different topic, layout, image, and caption every day, with seven rotating visual themes and policy screening.", icon: Share2, tone: "violet" },
];

const toneClass = {
  emerald: "bg-emerald-50 text-emerald-700", violet: "bg-violet-50 text-violet-700",
  amber: "bg-amber-50 text-amber-700", sky: "bg-sky-50 text-sky-700",
  rose: "bg-rose-50 text-rose-700", orange: "bg-orange-50 text-orange-700",
  cyan: "bg-cyan-50 text-cyan-700", blue: "bg-blue-50 text-blue-700",
  slate: "bg-slate-100 text-slate-700", lime: "bg-lime-50 text-lime-700",
};

const formatTime = (date = new Date()) => date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const AdminAgents = () => {
  const [products, setProducts] = useState([]);
  const [autopilot, setAutopilot] = useState(true);
  const [running, setRunning] = useState("");
  const [notice, setNotice] = useState("Integrated preview loaded. No live changes are enabled.");
  const [activity, setActivity] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [socialStatus, setSocialStatus] = useState(null);
  const [socialDraft, setSocialDraft] = useState(null);
  const [socialBusy, setSocialBusy] = useState("");

  useEffect(() => {
    api.get("/products", { params: { limit: 1000 } })
      .then(({ data }) => setProducts(data.products || []))
      .catch(() => setNotice("Catalog data is temporarily unavailable. All write actions remain blocked."));
    api.get("/admin/social/status")
      .then(({ data }) => {
        setSocialStatus(data);
        if (data.latestDraft?.id) setSocialDraft(data.latestDraft);
      })
      .catch(() => setSocialStatus(null));
  }, []);

  const socialError = (error) => error?.response?.data?.detail || "Agent 12 could not complete that request.";

  const connectInstagram = async () => {
    setSocialBusy("connect");
    try {
      const { data } = await api.post("/admin/social/connect-url");
      window.location.assign(data.url);
    } catch (error) {
      setNotice(socialError(error));
      setSocialBusy("");
    }
  };

  const createSocialDraft = async () => {
    setSocialBusy("draft");
    try {
      const { data } = await api.post("/admin/social/drafts");
      setSocialDraft(data.draft);
      setNotice(`${data.draft.themeName || "New"} theme created. Nothing has been posted.`);
    } catch (error) {
      setNotice(socialError(error));
    } finally {
      setSocialBusy("");
    }
  };

  const publishSocialTest = async () => {
    if (!socialDraft?.id || !window.confirm(`Publish this approved test to @${socialStatus?.username || "hdsmokeshop.altamonte"}?`)) return;
    setSocialBusy("publish");
    try {
      const { data } = await api.post(`/admin/social/drafts/${socialDraft.id}/publish`);
      setSocialDraft(data.draft);
      const { data: status } = await api.get("/admin/social/status");
      setSocialStatus(status);
      setNotice("The approved Instagram test was published and recorded in the audit history.");
    } catch (error) {
      setNotice(socialError(error));
    } finally {
      setSocialBusy("");
    }
  };

  const postHour = Number.isInteger(socialStatus?.scheduleHour) ? socialStatus.scheduleHour : 11;
  const postMinute = Number.isInteger(socialStatus?.scheduleMinute) ? socialStatus.scheduleMinute : 0;
  const postTime = new Date(2000, 0, 1, postHour, postMinute).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const setDailyPublishing = async (enabled) => {
    const confirmed = enabled ? window.prompt("To enable daily publishing, type the exact Instagram username: hdsmokeshop.altamonte") : "";
    if (enabled && confirmed === null) return;
    if (!window.confirm(enabled ? `Turn on one compliant Instagram post every day at ${postTime}?` : "Pause daily Instagram publishing?")) return;
    setSocialBusy("settings");
    try {
      const { data } = await api.put("/admin/social/settings", {
        autoPublishEnabled: enabled, confirmUsername: confirmed || "", scheduleHour: postHour, scheduleMinute: postMinute,
      });
      setSocialStatus(data);
      setNotice(enabled ? `Daily Instagram publishing is on for ${postTime} Eastern.` : "Daily Instagram publishing is paused.");
    } catch (error) {
      setNotice(socialError(error));
    } finally {
      setSocialBusy("");
    }
  };

  const metrics = useMemo(() => {
    const needsReview = products.filter((p) => !p.description || !p.image || (!p.sku && !p.barcode));
    const lowStock = products.filter((p) => Number(p.stock || 0) <= 5);
    const photoIssues = products.filter((p) => !p.image || String(p.image).toLowerCase().includes("placeholder"));
    return { products: products.length, needsReview: needsReview.length, lowStock: lowStock.length, photoIssues: photoIssues.length };
  }, [products]);

  const resultFor = (id) => {
    const results = {
      operations: `${metrics.products} products checked; ${metrics.needsReview} need review`,
      marketing: "Website and listing review prepared; no publishing performed",
      briefing: `${approvals.length} approvals waiting; ${metrics.lowStock} low-stock signals`,
      watchdog: "Primary site, Render URL, API, sitemap, and robots checks prepared",
      reputation: "Review response workspace ready; nothing posted",
      compliance: "Public 21+, ID, category, and claim signals checked",
      inventory: `${metrics.lowStock} low-stock signals; no supplier order placed`,
      photos: `${metrics.photoIssues} missing or placeholder photos detected`,
      support: "Support drafting workspace ready; nothing sent",
      competitors: "Awaiting an owner-supplied public competitor snapshot",
      delivery: "Delivery readiness workspace ready; no dispatch created",
      social: socialStatus?.connected
        ? `Instagram @${socialStatus.username} verified; ${socialStatus.autoPublishEnabled ? `daily ${postTime} publishing is on` : "daily publishing is off"}`
        : "Daily Instagram creative preview ready; account connection is still required",
    };
    return results[id] || "Read-only check completed";
  };

  const runAgent = (agent) => {
    setRunning(agent.id);
    window.setTimeout(() => {
      const result = resultFor(agent.id);
      const nextActivity = { id: `${agent.id}-${Date.now()}`, agent: agent.name, result, time: formatTime() };
      setActivity((rows) => [nextActivity, ...rows].slice(0, 8));
      if (["operations", "inventory", "photos", "reputation", "delivery", "social"].includes(agent.id)) {
        setApprovals((rows) => rows.some((r) => r.agentId === agent.id) ? rows : [{
          id: Date.now(), agentId: agent.id, agent: agent.name, summary: result, risk: ["inventory", "reputation", "delivery", "social"].includes(agent.id) ? "High" : "Medium", status: "Pending",
        }, ...rows]);
      }
      setNotice(`${agent.name} completed a read-only preview at ${formatTime()}. External writes: 0.`);
      setRunning("");
    }, 450);
  };

  const decide = (id, decision) => {
    setApprovals((rows) => rows.map((row) => row.id === id ? { ...row, status: decision === "approve" ? "Approved · execution blocked" : "Rejected" } : row));
    setNotice(decision === "approve" ? "Demo approval recorded. Execution remains blocked." : "Proposal rejected. No external change was made.");
  };

  const runAll = () => {
    setRunning("all");
    window.setTimeout(() => {
      setActivity((rows) => [{ id: `autopilot-${Date.now()}`, agent: "Autopilot", result: "Eight safe scheduled checks completed; external writes: 0", time: formatTime() }, ...rows].slice(0, 8));
      setNotice("Autopilot completed eight safe checks. External writes remain blocked.");
      setRunning("");
    }, 650);
  };

  return (
    <div className="space-y-6" data-testid="admin-agents">
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#102d20] via-[#176943] to-[#238357] px-6 py-8 md:px-10 md:py-10 text-white shadow-[0_20px_50px_rgba(15,63,40,.18)]">
        <div className="absolute -right-16 -top-32 h-72 w-72 rounded-full border-[54px] border-white/5" />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] font-extrabold uppercase tracking-[.18em] text-emerald-100">HD AgentOS · Integrated preview</span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold"><span className="h-2 w-2 rounded-full bg-emerald-300" /> Private admin only</span>
          </div>
          <h1 className="mt-5 max-w-3xl text-3xl md:text-5xl font-black tracking-[-.045em] leading-[1.04]">Every agent, task, and approval in one crisp control center.</h1>
          <p className="mt-4 max-w-2xl text-sm md:text-base text-emerald-50/80">Twelve agents prepare the work. Autopilot handles routine checks. You stay in control of anything external.</p>
        </div>
      </section>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          ["12", "Active agents"], ["8", "Auto schedules"], [String(approvals.filter((r) => r.status === "Pending").length), "Pending approvals"], [socialStatus?.autoPublishEnabled ? "1/day" : "0", "External writes"],
        ].map(([value, label]) => <div key={label} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"><p className="text-2xl md:text-3xl font-black tracking-tight text-neutral-900">{value}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.12em] text-neutral-500">{label}</p></div>)}
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">{notice}</div>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><p className="font-extrabold text-neutral-900">Instagram</p><p className="mt-1 text-xs text-neutral-500">{socialStatus?.connected ? `Verified @${socialStatus.username}` : "One-time secure Meta connection required"}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.1em] ${socialStatus?.connected ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>{socialStatus?.connected ? "Connected" : "Not connected"}</span></div>
          <div className="mt-4 flex flex-wrap gap-2">
            {!socialStatus?.connected && <button onClick={connectInstagram} disabled={Boolean(socialBusy)} className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{socialBusy === "connect" ? "Opening…" : "Connect Instagram"}</button>}
            <button onClick={createSocialDraft} disabled={Boolean(socialBusy)} className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 disabled:opacity-50">{socialBusy === "draft" ? "Creating…" : "Create today’s demo"}</button>
            {socialStatus?.connected && socialDraft?.status !== "published" && <button onClick={publishSocialTest} disabled={!socialDraft?.id || Boolean(socialBusy)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 disabled:opacity-50">Publish approved test</button>}
            {socialStatus?.connected && <button onClick={() => setDailyPublishing(!socialStatus.autoPublishEnabled)} disabled={Boolean(socialBusy)} className={`rounded-lg px-3 py-2 text-xs font-bold ${socialStatus.autoPublishEnabled ? "bg-rose-50 text-rose-700" : "bg-neutral-900 text-white"}`}>{socialStatus.autoPublishEnabled ? "Pause daily posts" : "Enable daily posts"}</button>}
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><p className="font-extrabold text-neutral-900">TikTok</p><p className="mt-1 text-xs text-neutral-500">Planned after Instagram is verified and tested</p></div><span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.1em] text-neutral-600">Later</span></div>
          <p className="mt-4 text-xs leading-5 text-neutral-500">No TikTok permissions, login, or posting are enabled yet.</p>
        </div>
      </section>

      <section className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-violet-600">Agent 12 creative rotation</p><h2 className="mt-1 text-xl font-black tracking-tight text-neutral-900">A visibly different post every day</h2><p className="mt-1 text-sm text-neutral-600">The calendar rotation prevents consecutive days from reusing a theme or topic.</p></div><div className="flex flex-wrap gap-1.5">{(socialStatus?.dailyThemes || ["Emerald Glow", "Neon Violet", "Warm Local", "Electric Blue", "Bold Magenta", "Modern Teal", "Premium Gold"]).map((theme) => <span key={theme} className="rounded-full border border-white/80 bg-white/75 px-2.5 py-1 text-[10px] font-bold text-violet-700">{theme}</span>)}</div></div>
        {socialDraft?.imageUrl && <div className="mt-5 grid gap-4 md:grid-cols-[180px_1fr]"><img src={socialDraft.imageUrl} alt={`${socialDraft.themeName || "Daily"} Instagram preview`} className="aspect-square w-full max-w-[180px] rounded-2xl object-cover shadow-md" /><div><p className="font-extrabold text-neutral-900">{socialDraft.themeName || "Today’s theme"} · {socialDraft.topic || "Daily business story"}</p><p className="mt-2 text-xs leading-5 text-neutral-500">Preview only until you use “Publish approved test.” The automatic schedule cannot turn on before that test succeeds.</p></div></div>}
      </section>

      <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/40 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 md:p-6 border-b border-emerald-100">
          <div>
            <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.12em] ${autopilot ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-600"}`}><Zap className="h-3.5 w-3.5" /> Autopilot {autopilot ? "running" : "paused"}</span>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-neutral-900">Safe autonomous checks</h2>
            <p className="mt-1 text-sm text-neutral-500">Routine checks stay read-only. Agent 12 can publish only after account verification, a successful approved test, and the daily-post switch.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={runAll} disabled={running === "all"} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${running === "all" ? "animate-spin" : ""}`} /> Run all now</button>
            <button onClick={() => setAutopilot((v) => !v)} className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-bold text-neutral-700 hover:bg-neutral-50">{autopilot ? <CirclePause className="h-4 w-4" /> : <CirclePlay className="h-4 w-4" />}{autopilot ? "Pause" : "Resume"}</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-sm">
            <thead className="bg-emerald-50/80 text-left text-[10px] uppercase tracking-[.12em] text-neutral-500"><tr><th className="px-5 py-3">Job</th><th className="px-5 py-3">Schedule</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Protection</th></tr></thead>
            <tbody className="divide-y divide-neutral-100">{schedules.map((job) => <tr key={job.id} className="bg-white/70"><td className="px-5 py-3.5"><span className="flex items-center gap-3 font-semibold text-neutral-800"><span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><job.icon className="h-4 w-4" /></span>{job.name}</span></td><td className="px-5 py-3.5 text-neutral-500">Every {job.every}</td><td className="px-5 py-3.5"><span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold"><CheckCircle2 className="h-4 w-4" /> Ready</span></td><td className="px-5 py-3.5 text-neutral-500">{job.id === "social" ? (socialStatus?.autoPublishEnabled ? "Verified auto-post" : "Approval gated") : "Read-only"}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-4"><h2 className="text-2xl font-black tracking-tight text-neutral-900">Specialist agents</h2><p className="mt-1 text-sm text-neutral-500">Focused assistants for the daily work around the store.</p></div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agentDefinitions.map((agent, index) => <article key={agent.id} className="group rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md">
            <div className="flex items-start justify-between gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${toneClass[agent.tone]}`}><agent.icon className="h-5 w-5" /></span><span className="text-[10px] font-extrabold uppercase tracking-[.14em] text-neutral-400">Agent {index + 1}</span></div>
            <h3 className="mt-4 text-lg font-extrabold tracking-tight text-neutral-900">{agent.name}</h3><p className="mt-1 min-h-[42px] text-sm leading-5 text-neutral-500">{agent.description}</p>
            <button onClick={() => runAgent(agent)} disabled={Boolean(running)} className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 hover:text-emerald-900 disabled:opacity-40">{running === agent.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />} Run preview <ChevronRight className="h-4 w-4" /></button>
          </article>)}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        <div className="xl:col-span-3 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="p-5 border-b border-neutral-100"><div className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-emerald-700" /><h2 className="text-xl font-black tracking-tight">Approval queue</h2></div><p className="mt-1 text-sm text-neutral-500">Nothing leaves this panel until you decide.</p></div>
          {approvals.length === 0 ? <div className="p-10 text-center text-sm text-neutral-500"><ShieldCheck className="mx-auto mb-3 h-8 w-8 text-emerald-600" />Run an agent to create a safe demo proposal.</div> : <div className="divide-y divide-neutral-100">{approvals.map((row) => <div key={row.id} className="p-4 md:p-5"><div className="flex flex-col md:flex-row md:items-center justify-between gap-3"><div><div className="flex items-center gap-2"><span className="font-bold text-neutral-900">{row.agent}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${row.risk === "High" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{row.risk}</span></div><p className="mt-1 text-sm text-neutral-500">{row.summary}</p><p className="mt-1 text-xs font-semibold text-neutral-400">{row.status}</p></div>{row.status === "Pending" && <div className="flex gap-2"><button onClick={() => decide(row.id, "approve")} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Approve demo</button><button onClick={() => decide(row.id, "reject")} className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">Reject</button></div>}</div></div>)}</div>}
        </div>
        <div className="xl:col-span-2 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Route className="h-5 w-5 text-emerald-700" /><h2 className="text-xl font-black tracking-tight">Recent activity</h2></div><div className="mt-4 space-y-4">{activity.length === 0 ? <p className="text-sm text-neutral-500">Agent results will appear here.</p> : activity.map((row) => <div key={row.id} className="flex gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" /><div><p className="text-sm font-bold text-neutral-800">{row.agent} <span className="font-normal text-neutral-400">· {row.time}</span></p><p className="text-xs leading-5 text-neutral-500">{row.result}</p></div></div>)}</div></div>
      </section>
    </div>
  );
};

export default AdminAgents;

