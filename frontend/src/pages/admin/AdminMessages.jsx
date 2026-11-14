import React, { useEffect, useState } from "react";
import { Inbox, Reply, Archive, CheckCircle2, Mail, RotateCcw } from "lucide-react";
import api from "../../api";

// Messages people send through the Contact page (they are also emailed to the store inbox).
const when = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const replyLink = (m) => {
  const subject = `Re: ${m.subject}`;
  const quoted = m.message.split("\n").map((l) => `> ${l}`).join("\n");
  const body = `Hi ${m.name.split(" ")[0]},\n\n\n\nHD Smoke Shop\n(407) 625-6826 · puff2door.com\n\nOn ${new Date(m.createdAt).toLocaleString("en-US")}, ${m.name} wrote:\n${quoted}`;
  return `mailto:${m.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

const Badge = ({ status }) => {
  if (status === "new") return <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">New</span>;
  if (status === "replied") return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-emerald-800">Replied</span>;
  return <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-neutral-600">Archived</span>;
};

const AdminMessages = () => {
  const [view, setView] = useState("inbox");
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const load = (v = view) => api.get("/admin/messages", { params: { status: v } }).then(({ data: d }) => setData(d)).catch(() => setData({ messages: [], unread: 0 }));
  useEffect(() => { setData(null); load(view); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  const setStatus = async (m, status) => {
    setData((d) => ({ ...d, messages: d.messages.map((x) => (x.id === m.id ? { ...x, status } : x)) }));
    try { await api.patch(`/admin/messages/${m.id}`, { status }); } catch { /* reload below shows the real state */ }
    load();
    window.dispatchEvent(new Event("p2d-messages-changed"));
  };

  const messages = data?.messages || [];
  return (
    <div className="max-w-3xl" data-testid="admin-messages">
      <h1 className="hidden lg:flex items-center gap-2 font-heading text-3xl uppercase mb-2"><Inbox className="h-7 w-7 text-emerald-600" />Messages</h1>
      <p className="text-sm text-neutral-600 mb-4">What people send from the <b>Contact</b> page. Each one is also emailed to your store inbox.</p>
      <div className="mb-4 inline-flex rounded-xl bg-neutral-100 p-1 text-sm font-bold">
        {[["inbox", `Inbox${data?.unread ? ` (${data.unread} new)` : ""}`], ["archived", "Archived"]].map(([v, label]) => (
          <button key={v} type="button" onClick={() => setView(v)} className={`rounded-lg px-4 py-2 ${view === v ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500"}`}>{label}</button>
        ))}
      </div>

      {!data ? <p className="py-10 text-center text-neutral-500">Loading…</p> : !messages.length ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 py-12 text-center text-neutral-500">
          <Mail className="mx-auto mb-2 h-8 w-8 text-neutral-300" />{view === "archived" ? "Nothing archived." : "No messages yet."}
        </div>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => {
            const isOpen = open === m.id;
            return (
              <li key={m.id} className={`rounded-2xl border bg-white ${m.status === "new" ? "border-emerald-300 shadow-sm" : "border-neutral-200"}`} data-testid="admin-message">
                <button type="button" onClick={() => { setOpen(isOpen ? null : m.id); }} className="w-full px-4 py-3 text-left">
                  <div className="flex items-center gap-2">
                    <span className={`truncate ${m.status === "new" ? "font-extrabold" : "font-semibold"}`}>{m.name}</span>
                    <Badge status={m.status} />
                    <span className="ml-auto shrink-0 text-xs text-neutral-500">{when(m.createdAt)}</span>
                  </div>
                  <p className={`truncate text-sm ${m.status === "new" ? "font-bold text-neutral-900" : "text-neutral-800"}`}>{m.subject}</p>
                  {!isOpen && <p className="truncate text-sm text-neutral-500">{m.message}</p>}
                </button>
                {isOpen && (
                  <div className="border-t border-neutral-100 px-4 pb-4 pt-3">
                    <a href={`mailto:${m.email}`} className="text-sm font-semibold text-emerald-700 break-all">{m.email}</a>
                    <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-neutral-800">{m.message}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <a href={replyLink(m)} onClick={() => m.status === "new" && setStatus(m, "replied")} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white" data-testid="message-reply"><Reply className="h-4 w-4" />Reply</a>
                      {m.status === "new" && <button type="button" onClick={() => setStatus(m, "replied")} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-bold"><CheckCircle2 className="h-4 w-4" />Mark replied</button>}
                      {m.status !== "archived"
                        ? <button type="button" onClick={() => setStatus(m, "archived")} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-bold"><Archive className="h-4 w-4" />Archive</button>
                        : <button type="button" onClick={() => setStatus(m, "replied")} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-bold"><RotateCcw className="h-4 w-4" />Move to inbox</button>}
                      {m.status === "replied" && <button type="button" onClick={() => setStatus(m, "new")} className="rounded-lg px-3 py-2.5 text-sm font-semibold text-neutral-500">Mark unread</button>}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default AdminMessages;
