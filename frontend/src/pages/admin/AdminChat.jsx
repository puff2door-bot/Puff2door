import React, { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Search, CheckCircle2, RotateCcw, Settings2, Save, Mail, Phone, Clock } from "lucide-react";
import api from "../../api";
import { useToast } from "../../hooks/use-toast";

const inputCls = "w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-emerald-600 transition-colors";
const fmt = (iso) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
const ContactIcon = ({ contact }) => (contact?.includes("@") ? <Mail className="h-3 w-3" /> : <Phone className="h-3 w-3" />);

const ChatSettings = ({ settings, onSaved }) => {
  const [f, setF] = useState(settings);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  useEffect(() => setF(settings), [settings]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.put("/admin/chat/settings", f);
      onSaved(data);
      toast({ title: "Chat settings saved" });
    } catch (err) {
      toast({ title: "Save failed", description: err?.response?.data?.detail || "Try again", variant: "destructive" });
    } finally { setBusy(false); }
  };

  if (!f) return null;
  return (
    <form onSubmit={save} data-testid="chat-settings" className="border border-neutral-200 rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <h2 className="font-heading text-xl uppercase tracking-wide flex items-center gap-2"><Settings2 className="h-5 w-5 text-emerald-600" /> Chat settings</h2>
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm font-bold cursor-pointer"><input type="checkbox" data-testid="chat-setting-enabled" className="accent-emerald-600 h-4 w-4" checked={f.chatEnabled} onChange={(e) => setF({ ...f, chatEnabled: e.target.checked })} /> Chat {f.chatEnabled ? "ON" : "OFF"}</label>
          <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
            <input type="checkbox" data-testid="chat-setting-online" className="accent-emerald-600 h-4 w-4" checked={f.chatOnline} onChange={(e) => setF({ ...f, chatOnline: e.target.checked })} />
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${f.chatOnline ? "bg-emerald-100 text-emerald-800" : "bg-neutral-200 text-neutral-700"}`}><span className={`h-2 w-2 rounded-full ${f.chatOnline ? "bg-emerald-500" : "bg-neutral-400"}`} />{f.chatOnline ? "Online" : "Offline"}</span>
          </label>
          <button disabled={busy} data-testid="chat-settings-save" className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-900 text-white text-sm font-bold rounded-full hover:bg-emerald-600 disabled:opacity-60"><Save className="h-4 w-4" /> {busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label className="block text-xs font-bold text-neutral-600 mb-1">Welcome message (shown when online)</label><textarea required maxLength={500} rows={2} data-testid="chat-setting-welcome" className={`${inputCls} resize-none`} value={f.chatWelcome} onChange={(e) => setF({ ...f, chatWelcome: e.target.value })} /></div>
        <div><label className="block text-xs font-bold text-neutral-600 mb-1">Offline message</label><textarea required maxLength={500} rows={2} data-testid="chat-setting-offline" className={`${inputCls} resize-none`} value={f.chatOffline} onChange={(e) => setF({ ...f, chatOffline: e.target.value })} /></div>
      </div>
    </form>
  );
};

const Thread = ({ convId, onChanged }) => {
  const [d, setD] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const { toast } = useToast();

  const load = useCallback(() => api.get(`/admin/chat/conversations/${convId}`).then(({ data }) => setD(data)).catch(() => setD(null)), [convId]);
  useEffect(() => { setD(null); load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [d?.messages?.length]);

  const reply = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.post(`/admin/chat/conversations/${convId}/reply`, { message: text.trim() });
      setText("");
      await load();
      onChanged();
    } catch (err) {
      toast({ title: "Reply failed", description: err?.response?.data?.detail || "Try again", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const setStatus = async (status) => {
    await api.put(`/admin/chat/conversations/${convId}/status`, { status });
    await load();
    onChanged();
    toast({ title: status === "resolved" ? "Conversation resolved" : "Conversation reopened" });
  };

  if (!d) return <p className="text-sm text-neutral-500 p-6">Loading conversation…</p>;
  const c = d.conversation;
  return (
    <div data-testid="chat-thread" className="border border-neutral-200 rounded-2xl flex flex-col h-[640px] overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-200 flex items-start justify-between gap-3 flex-wrap bg-neutral-50">
        <div className="min-w-0">
          <p className="font-bold text-neutral-900 truncate" data-testid="chat-thread-name">{c.name || "Customer"} {c.userId && <span className="text-[10px] font-bold uppercase text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded ml-1">Account</span>}</p>
          <p className="text-xs text-neutral-500 flex items-center gap-1.5 truncate" data-testid="chat-thread-contact"><ContactIcon contact={c.contact} /> {c.contact}{c.page ? <span className="text-neutral-400"> · from {c.page.replace(/^https?:\/\/[^/]+/, "") || "/"}</span> : null}</p>
          <p className="text-[11px] text-neutral-400 flex items-center gap-1 mt-0.5"><Clock className="h-3 w-3" /> Started {fmt(c.createdAt)}{c.offline ? " · left while offline" : ""}</p>
        </div>
        {c.status === "open" ? (
          <button type="button" onClick={() => setStatus("resolved")} data-testid="chat-resolve" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full bg-emerald-600 text-white hover:bg-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Mark resolved</button>
        ) : (
          <button type="button" onClick={() => setStatus("open")} data-testid="chat-reopen" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full border border-neutral-300 text-neutral-700 hover:border-neutral-900"><RotateCcw className="h-3.5 w-3.5" /> Reopen</button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5" data-testid="chat-thread-messages">
        {d.messages.map((m) => (
          <div key={m.id} data-testid={`admin-msg-${m.sender}`} className={`flex ${m.sender === "admin" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${m.sender === "admin" ? "bg-neutral-900 text-white rounded-br-sm" : "bg-emerald-50 border border-emerald-100 text-neutral-900 rounded-bl-sm"}`}>
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
              <p className={`text-[10px] mt-1 ${m.sender === "admin" ? "text-neutral-400" : "text-neutral-500"}`}>{m.sender === "admin" ? "You" : c.name} · {fmt(m.createdAt)}</p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {d.previous.length > 0 && (
        <div className="px-4 py-2 border-t border-neutral-100 text-xs text-neutral-500 flex items-center gap-2 flex-wrap" data-testid="chat-previous">
          <span className="font-bold">Previous conversations:</span>
          {d.previous.map((p) => <button type="button" key={p.id} onClick={() => onChanged(p.id)} className="underline hover:text-neutral-900">{fmt(p.lastMessageAt)} · {p.status}</button>)}
        </div>
      )}
      <form onSubmit={reply} className="p-3 border-t border-neutral-200 flex gap-2">
        <input maxLength={2000} data-testid="chat-reply-input" placeholder={`Reply to ${c.name || "customer"}…`} className="flex-1 border border-neutral-300 rounded-full px-4 py-2.5 text-sm outline-none focus:border-emerald-600" value={text} onChange={(e) => setText(e.target.value)} />
        <button disabled={busy || !text.trim()} data-testid="chat-reply-send" className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50"><Send className="h-4 w-4" /> Send</button>
      </form>
    </div>
  );
};

const AdminChat = () => {
  const [tab, setTab] = useState("open");
  const [q, setQ] = useState("");
  const [list, setList] = useState({ conversations: [], unreadTotal: 0, openCount: 0, settings: null });
  const [selected, setSelected] = useState(null);

  const load = useCallback(() => api.get("/admin/chat/conversations", { params: { status: tab, q } }).then(({ data }) => setList(data)).catch(() => {}), [tab, q]);
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [load]);

  return (
    <div data-testid="admin-chat">
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-3xl uppercase tracking-tight flex items-center gap-2"><MessageCircle className="h-7 w-7 text-emerald-600" /> Live Chat</h1>
          <p className="text-sm text-neutral-500">Real-time customer conversations. Refreshes every few seconds.</p>
        </div>
        <div className="flex gap-2">
          <span data-testid="chat-open-count" className="text-xs font-bold px-3 py-1.5 rounded-full bg-neutral-100 text-neutral-700">{list.openCount} open</span>
          <span data-testid="chat-unread-total" className={`text-xs font-bold px-3 py-1.5 rounded-full ${list.unreadTotal ? "bg-red-100 text-red-700" : "bg-neutral-100 text-neutral-500"}`}>{list.unreadTotal} unread</span>
        </div>
      </div>

      {list.settings && <ChatSettings settings={list.settings} onSaved={(s) => setList((l) => ({ ...l, settings: s }))} />}

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
        <div>
          <div className="flex gap-1 mb-3">
            {["open", "resolved", "all"].map((t) => <button type="button" key={t} data-testid={`chat-tab-${t}`} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-full text-xs font-bold capitalize ${tab === t ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>{t}</button>)}
          </div>
          <div className="flex items-center border border-neutral-300 rounded-lg px-3 mb-3 focus-within:border-emerald-600"><Search className="h-4 w-4 text-neutral-400" /><input data-testid="chat-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone…" className="flex-1 px-2 py-2.5 text-sm outline-none" /></div>
          <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1" data-testid="chat-list">
            {list.conversations.length === 0 ? <p className="text-sm text-neutral-500 border border-dashed rounded-xl p-6 text-center" data-testid="chat-list-empty">No {tab === "all" ? "" : tab} conversations.</p> : list.conversations.map((c) => (
              <button type="button" key={c.id} onClick={() => setSelected(c.id)} data-testid={`chat-conv-${c.id}`} className={`w-full text-left border rounded-xl px-4 py-3 transition-colors ${selected === c.id ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 hover:border-emerald-300"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-neutral-900 truncate">{c.name || "Customer"}</p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {c.unreadAdmin > 0 && <span data-testid="chat-conv-unread" className="text-[11px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5">{c.unreadAdmin}</span>}
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${c.status === "open" ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}`}>{c.status}</span>
                  </div>
                </div>
                <p className="text-xs text-neutral-500 truncate flex items-center gap-1"><ContactIcon contact={c.contact} /> {c.contact}</p>
                <p className="text-xs text-neutral-600 truncate mt-1">{c.lastSender === "admin" ? "You: " : ""}{c.lastMessage}</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">{fmt(c.lastMessageAt)}{c.offline ? " · offline message" : ""}</p>
              </button>
            ))}
          </div>
        </div>
        <div>{selected ? <Thread convId={selected} onChanged={(id) => { if (typeof id === "string") setSelected(id); load(); }} /> : <p className="text-sm text-neutral-500 border border-dashed rounded-2xl p-10 text-center" data-testid="chat-thread-empty">Select a conversation to read and reply.</p>}</div>
      </div>
    </div>
  );
};

export default AdminChat;
