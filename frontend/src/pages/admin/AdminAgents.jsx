import React, { useEffect, useState } from "react";
import {
  Activity, Bot, Camera, ChevronRight,
  Globe2, HeartHandshake, Megaphone, PackageSearch,
  RefreshCw, ShieldCheck, Sparkles, Truck, Users,
  Share2,
} from "lucide-react";
import api from "../../api";
import AutomationsPanel from "./AutomationsPanel";

const AGENT_ICONS = {
  operations: Bot, marketing: Megaphone, briefing: Sparkles, watchdog: Globe2, reputation: HeartHandshake,
  compliance: ShieldCheck, inventory: PackageSearch, photos: Camera, support: Users, delivery: Truck, social: Share2,
};
const STATUS_STYLE = {
  ok: { label: "All good", pill: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-500" },
  warn: { label: "Take a look", pill: "bg-amber-100 text-amber-800", bar: "bg-amber-500" },
  alert: { label: "Needs you", pill: "bg-rose-100 text-rose-800", bar: "bg-rose-500" },
};

const REVIEW_TEMPLATES = [
  { title: "5-star thank you", text: "Thank you so much for the kind words! We're glad you had a great visit to HD Smoke Shop. See you next time on SR 434!" },
  { title: "Great service mention", text: "Thanks for shouting out our team! Friendly, straightforward help is what we aim for every day. We appreciate you choosing a local shop." },
  { title: "Product didn't meet expectations", text: "Thanks for letting us know, and sorry it wasn't what you expected. Please stop by or call (407) 625-6826 and we'll do our best to make it right." },
  { title: "Wait time / busy store", text: "Sorry about the wait, and thank you for your patience. We're working on keeping the counter moving quickly, especially in the evenings." },
  { title: "Negative review (stay calm)", text: "We're sorry to hear about your experience. We'd like to understand what happened — please call us at (407) 625-6826 so we can look into it." },
];
const SUPPORT_TEMPLATES = [
  { title: "Hours", text: "We're open every day from 10 AM to 10 PM at 481 N State Rd 434, Suite 1050, Altamonte Springs." },
  { title: "ID rules", text: "You must be 21 or older. Please bring a valid, unexpired government photo ID — we check it in store and at delivery." },
  { title: "Delivery area", text: "We deliver locally around Altamonte Springs (ZIP 32714 and nearby). Enter your address at checkout to see if you're in range. ID is checked at the door." },
  { title: "Order status", text: "You can track your order any time at puff2door.com/track with your order number and email." },
  { title: "Payment", text: "You can pay online at checkout. For delivery, have your ID ready — the name must match the order." },
  { title: "Stock question", text: "Stock changes daily. If it shows on puff2door.com, it's on our shelf right now. Call (407) 625-6826 to double-check before you come in." },
];

const formatWhen = (value) => {
  if (!value) return "Not run yet";
  const d = new Date(value);
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const CopyButton = ({ text }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* ignore */ } }}
      className="shrink-0 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-bold text-neutral-700 hover:bg-neutral-50"
    >{done ? "Copied" : "Copy"}</button>
  );
};

const AdminAgents = () => {
  const [agents, setAgents] = useState([]);
  const [running, setRunning] = useState("");
  const [open, setOpen] = useState("");
  const [notice, setNotice] = useState("Agents only read your data and report. They never change products, prices, orders or Clover.");
  const [socialStatus, setSocialStatus] = useState(null);
  const [socialDraft, setSocialDraft] = useState(null);
  const [socialBusy, setSocialBusy] = useState("");

  useEffect(() => {
    loadAgents();
    api.get("/admin/social/status")
      .then(({ data }) => {
        setSocialStatus(data);
        if (data.latestDraft?.id) setSocialDraft(data.latestDraft);
      })
      .catch(() => setSocialStatus(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!socialDraft?.id || !window.confirm(`This will post the preview image to @${socialStatus?.username || "hdsmokeshop.altamonte"} on Instagram right now, in addition to the automatic daily post. Continue?`)) return;
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

  async function loadAgents() {
    try {
      const { data } = await api.get("/admin/agents");
      setAgents(data.agents || []);
    } catch {
      setNotice("Agent results could not be loaded right now.");
    }
  }

  const runAgent = async (agent, email = false) => {
    setRunning(agent.id);
    try {
      const { data } = await api.post(`/admin/agents/${agent.id}/run`, null, { params: { email } });
      setAgents((rows) => rows.map((row) => row.id === agent.id ? { ...row, latest: data } : row));
      setOpen(agent.id);
      setNotice(`${agent.name} checked just now${email ? " and emailed you the result" : ""}.`);
    } catch (error) {
      setNotice(error?.response?.data?.detail || `${agent.name} could not run.`);
    } finally {
      setRunning("");
    }
  };

  const runAll = async () => {
    setRunning("all");
    for (const agent of agents.filter((a) => !["support", "briefing"].includes(a.id))) {
      try {
        const { data } = await api.post(`/admin/agents/${agent.id}/run`);
        setAgents((rows) => rows.map((row) => row.id === agent.id ? { ...row, latest: data } : row));
      } catch { /* keep going */ }
    }
    setRunning("");
    setNotice("All checks ran just now.");
  };

  const ignoreItem = async (agent, item) => {
    try {
      await api.post(`/admin/agents/${agent.id}/ignore`, { item });
      setAgents((rows) => rows.map((row) => row.id === agent.id && row.latest
        ? { ...row, latest: { ...row.latest, items: row.latest.items.filter((x) => x !== item), ignoredCount: (row.latest.ignoredCount || 0) + 1 } }
        : row));
      setNotice("Hidden. That finding won't show or be emailed again.");
    } catch { setNotice("Could not hide that finding."); }
  };

  const restoreIgnored = async (agent) => {
    await api.post(`/admin/agents/${agent.id}/unignore-all`).catch(() => {});
    runAgent(agent);
  };

  const [descs, setDescs] = useState({ pending: 0, approved: 0, drafts: [] });
  const [edits, setEdits] = useState({});
  const [descBusy, setDescBusy] = useState(false);
  const loadDescs = async () => { try { const { data } = await api.get("/admin/descriptions"); setDescs(data); } catch { /* ignore */ } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadDescs(); }, []);
  const descAction = async (kind, ids) => {
    if (!ids.length) return;
    setDescBusy(true);
    try {
      const { data } = await api.post(`/admin/descriptions/${kind}`, { ids, edits: kind === "approve" ? Object.fromEntries(ids.filter((id) => edits[id]).map((id) => [id, edits[id]])) : {} });
      setNotice(kind === "approve" ? `${data.approved} descriptions added to your website.` : `${data.skipped} skipped.`);
      await loadDescs();
    } catch (error) {
      setNotice(error?.response?.data?.detail || "Could not save those descriptions.");
    } finally { setDescBusy(false); }
  };
  const generateDescs = async () => {
    setDescBusy(true);
    try { const { data } = await api.post("/admin/descriptions/generate"); setNotice(`${data.created} new description drafts are ready for review.`); await loadDescs(); }
    catch { setNotice("Could not create drafts."); } finally { setDescBusy(false); }
  };

  const counts = agents.reduce((acc, a) => { const st = a.latest?.status; if (st) acc[st] = (acc[st] || 0) + 1; return acc; }, {});

  return (
    <div className="space-y-6" data-testid="admin-agents">
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#102d20] via-[#176943] to-[#238357] px-6 py-8 md:px-10 md:py-10 text-white shadow-[0_20px_50px_rgba(15,63,40,.18)]">
        <div className="absolute -right-16 -top-32 h-72 w-72 rounded-full border-[54px] border-white/5" />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] font-extrabold uppercase tracking-[.18em] text-emerald-100">HD AgentOS</span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold"><span className="h-2 w-2 rounded-full bg-emerald-300" /> Private admin only</span>
          </div>
          <h1 className="mt-5 max-w-3xl text-3xl md:text-5xl font-black tracking-[-.045em] leading-[1.04]">Your store, checked around the clock.</h1>
          <p className="mt-4 max-w-2xl text-sm md:text-base text-emerald-50/80">Eleven agents check your website, Clover sync, stock, photos and compliance, then email you a briefing every morning at 8 AM. They only read and report.</p>
        </div>
      </section>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          [String(agents.length || 11), "Agents"], [String(counts.ok || 0), "All good"], [String(counts.warn || 0), "Take a look"], [String(counts.alert || 0), "Need you"],
        ].map(([value, label]) => <div key={label} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"><p className="text-2xl md:text-3xl font-black tracking-tight text-neutral-900">{value}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.12em] text-neutral-500">{label}</p></div>)}
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">{notice}</div>

      <AutomationsPanel />

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><p className="font-extrabold text-neutral-900">Instagram</p><p className="mt-1 text-xs text-neutral-500">{socialStatus?.connected ? `Verified @${socialStatus.username}` : "One-time secure Meta connection required"}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.1em] ${socialStatus?.connected ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>{socialStatus?.connected ? "Connected" : "Not connected"}</span></div>
          <div className="mt-4 flex flex-wrap gap-2">
            {!socialStatus?.connected && <button onClick={connectInstagram} disabled={Boolean(socialBusy)} className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{socialBusy === "connect" ? "Opening…" : "Connect Instagram"}</button>}
            <button onClick={createSocialDraft} disabled={Boolean(socialBusy)} className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 disabled:opacity-50">{socialBusy === "draft" ? "Creating…" : "Make a preview (doesn’t post)"}</button>
            {socialStatus?.connected && socialDraft?.status !== "published" && <button onClick={publishSocialTest} disabled={!socialDraft?.id || Boolean(socialBusy)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 disabled:opacity-50">Post this preview to Instagram now</button>}
            {socialStatus?.connected && <button onClick={() => setDailyPublishing(!socialStatus.autoPublishEnabled)} disabled={Boolean(socialBusy)} className={`rounded-lg px-3 py-2 text-xs font-bold ${socialStatus.autoPublishEnabled ? "bg-rose-50 text-rose-700" : "bg-neutral-900 text-white"}`}>{socialStatus.autoPublishEnabled ? "Pause daily posts" : "Enable daily posts"}</button>}
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><p className="font-extrabold text-neutral-900">TikTok</p><p className="mt-1 text-xs text-neutral-500">Planned after Instagram is verified and tested</p></div><span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.1em] text-neutral-600">Later</span></div>
          <p className="mt-4 text-xs leading-5 text-neutral-500">No TikTok permissions, login, or posting are enabled yet.</p>
        </div>
      </section>

      <section className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-violet-600">Agent 12 creative rotation</p><h2 className="mt-1 text-xl font-black tracking-tight text-neutral-900">A new layout, color set and featured shelf every day</h2><p className="mt-1 text-sm text-neutral-600">7 layouts × 10 color sets using your own product photos. Never features THC/delta or kratom. Daily post at {postTime}.</p></div><div className="flex flex-wrap gap-1.5">{["Poster", "Grid", "Neon", "Magazine", "Split", "Polaroid", "Bold type"].map((theme) => <span key={theme} className="rounded-full border border-white/80 bg-white/75 px-2.5 py-1 text-[10px] font-bold text-violet-700">{theme}</span>)}</div></div>
        {socialDraft?.imageUrl && <div className="mt-5 grid gap-4 md:grid-cols-[180px_1fr]"><img src={socialDraft.imageUrl} alt={`${socialDraft.themeName || "Daily"} Instagram preview`} className="aspect-[4/5] w-full max-w-[180px] rounded-2xl object-cover shadow-md" /><div><p className="font-extrabold text-neutral-900">{socialDraft.themeName || "Today’s theme"} · {socialDraft.topic || "Daily business story"}</p><p className="mt-2 text-xs leading-5 text-neutral-500">Preview only. Nothing is posted unless you press “Post this preview to Instagram now.” The daily post is made automatically.</p></div></div>}
      </section>

      <section>
        <div className="mb-4 flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div><h2 className="text-2xl font-black tracking-tight text-neutral-900">Agents</h2><p className="mt-1 text-sm text-neutral-500">Each card shows the latest real check. Tap one to see details.</p></div>
          <button onClick={runAll} disabled={Boolean(running)} className="inline-flex items-center gap-2 self-start rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${running === "all" ? "animate-spin" : ""}`} /> Run all checks now</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((agent) => {
            const Icon = AGENT_ICONS[agent.id] || Bot;
            const st = STATUS_STYLE[agent.latest?.status] || null;
            const isOpen = open === agent.id;
            return (
              <article key={agent.id} className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                {st && <span className={`absolute inset-x-0 top-0 h-1 ${st.bar}`} />}
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Icon className="h-5 w-5" /></span>
                  <div className="text-right"><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-neutral-400">Agent {agent.number}</p><p className="text-[11px] text-neutral-500">{agent.schedule}</p></div>
                </div>
                <h3 className="mt-4 text-lg font-extrabold tracking-tight text-neutral-900">{agent.name}</h3>
                <p className="mt-1 text-sm leading-5 text-neutral-500">{agent.description}</p>
                {agent.latest ? (
                  <button onClick={() => setOpen(isOpen ? "" : agent.id)} className="mt-3 w-full rounded-xl bg-neutral-50 p-3 text-left hover:bg-neutral-100">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${st?.pill}`}>{st?.label}</span>
                    <p className="mt-1.5 text-sm font-semibold text-neutral-800">{agent.latest.headline}</p>
                    <p className="mt-1 text-[11px] text-neutral-400">Checked {formatWhen(agent.latest.ranAt)}{agent.latest.items?.length ? ` · ${isOpen ? "hide" : "show"} details` : ""}</p>
                  </button>
                ) : <p className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-500">Not run yet.</p>}
                {isOpen && agent.latest?.items?.length > 0 && (
                  <ul className="mt-3 max-h-64 space-y-1.5 overflow-y-auto text-xs leading-5 text-neutral-600">
                    {agent.latest.items.map((item, i) => (
                      <li key={i} className="group flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400" />
                        <span className="min-w-0 flex-1">{item}</span>
                        {!["watchdog", "reputation", "briefing"].includes(agent.id) && (
                          <button onClick={() => ignoreItem(agent, item)} className="shrink-0 text-[11px] font-semibold text-neutral-400 hover:text-rose-600" title="Stop showing this">Ignore</button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {isOpen && agent.latest?.ignoredCount > 0 && (
                  <button onClick={() => restoreIgnored(agent)} className="mt-2 text-[11px] font-semibold text-neutral-500 underline">{agent.latest.ignoredCount} ignored · show them again</button>
                )}
                {agent.id !== "support" && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button onClick={() => runAgent(agent)} disabled={Boolean(running)} className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 hover:text-emerald-900 disabled:opacity-40">{running === agent.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />} Check now</button>
                    <button onClick={() => runAgent(agent, true)} disabled={Boolean(running)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-500 hover:text-neutral-800 disabled:opacity-40">Email me this <ChevronRight className="h-4 w-4" /></button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black tracking-tight">Product descriptions waiting for you</h2>
            <p className="mt-1 text-sm text-neutral-500">Written from each product's name, brand and category. Nothing goes on the website until you approve it. {descs.approved > 0 && `${descs.approved} approved so far.`}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {descs.pending === 0 && <button onClick={generateDescs} disabled={descBusy} className="rounded-lg bg-neutral-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Write drafts for products without one</button>}
            {descs.drafts.length > 0 && <>
              <button onClick={() => descAction("approve", descs.drafts.map((d) => d.id))} disabled={descBusy} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Approve all {descs.drafts.length} shown</button>
              <button onClick={() => descAction("skip", descs.drafts.map((d) => d.id))} disabled={descBusy} className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-bold text-neutral-600 disabled:opacity-50">Skip all shown</button>
            </>}
          </div>
        </div>
        {descs.pending > 0 && <p className="mt-3 text-xs font-semibold text-neutral-500">{descs.pending} waiting · showing {descs.drafts.length} at a time, best-stocked products first. You can edit any text before approving.</p>}
        <div className="mt-4 space-y-3">
          {descs.drafts.map((d) => (
            <div key={d.id} className="rounded-xl bg-neutral-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-bold text-neutral-800">{d.name}</p>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => descAction("approve", [d.id])} disabled={descBusy} className="rounded-lg bg-emerald-700 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50">Approve</button>
                  <button onClick={() => descAction("skip", [d.id])} disabled={descBusy} className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-bold text-neutral-600 disabled:opacity-50">Skip</button>
                </div>
              </div>
              <textarea value={edits[d.id] ?? d.text} onChange={(e) => setEdits((m) => ({ ...m, [d.id]: e.target.value }))} rows={3} className="mt-2 w-full rounded-lg border border-neutral-200 bg-white p-2 text-xs leading-5 text-neutral-700" />
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {[["Review reply templates", "For Google and Yelp. Copy, adjust the name, paste.", REVIEW_TEMPLATES, HeartHandshake], ["Customer support answers", "For Live Chat, texts and calls.", SUPPORT_TEMPLATES, Users]].map(([title, sub, list, Icon]) => (
          <div key={title} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><Icon className="h-5 w-5 text-emerald-700" /><h2 className="text-xl font-black tracking-tight">{title}</h2></div>
            <p className="mt-1 text-sm text-neutral-500">{sub}</p>
            <div className="mt-4 space-y-3">
              {list.map((t) => (
                <div key={t.title} className="flex items-start justify-between gap-3 rounded-xl bg-neutral-50 p-3">
                  <div className="min-w-0"><p className="text-sm font-bold text-neutral-800">{t.title}</p><p className="mt-0.5 text-xs leading-5 text-neutral-600">{t.text}</p></div>
                  <CopyButton text={t.text} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};

export default AdminAgents;

