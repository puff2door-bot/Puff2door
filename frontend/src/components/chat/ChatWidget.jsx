import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import api from "../../api";
import { useApp } from "../../context/AppContext";

const TOKEN_KEY = "p2d_chat_token";
const chatHeaders = () => ({ "X-Chat-Token": localStorage.getItem(TOKEN_KEY) || "" });
const inputCls = "w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-emerald-600 transition-colors";
const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const StatusDot = ({ online }) => (
  <span data-testid="chat-status" className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${online ? "bg-emerald-500/20 text-emerald-300" : "bg-neutral-700 text-neutral-300"}`}>
    <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-400 animate-pulse" : "bg-neutral-400"}`} /> {online ? "Online" : "Offline"}
  </span>
);

const StartForm = ({ status, onStarted }) => {
  const { user } = useApp();
  const [f, setF] = useState({ name: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "", contact: user?.email || "", message: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const { data } = await api.post("/chat/start", f);
      localStorage.setItem(TOKEN_KEY, data.token);
      onStarted(data);
    } catch (ex) {
      const d = ex?.response?.data?.detail;
      setErr(typeof d === "string" ? d : Array.isArray(d) ? d.map((x) => x.msg).join(", ") : "Could not start chat. Please try again.");
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} data-testid="chat-start-form" className="p-4 space-y-3">
      <p className="text-sm text-neutral-700" data-testid="chat-intro">{status.online ? status.welcome : status.offlineMessage}</p>
      <input required maxLength={80} data-testid="chat-name" placeholder="Your name" className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input required maxLength={120} data-testid="chat-contact" placeholder="Email or phone" className={inputCls} value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} />
      <textarea required maxLength={2000} rows={3} data-testid="chat-first-message" placeholder={status.online ? "How can we help?" : "Leave us a message…"} className={`${inputCls} resize-none`} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
      {err && <p className="text-xs text-red-600" data-testid="chat-error">{err}</p>}
      <button disabled={busy} data-testid="chat-start-submit" className="w-full py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-full hover:bg-emerald-700 disabled:opacity-60 flex items-center justify-center gap-2">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {status.online ? "Start chat" : "Send message"}
      </button>
    </form>
  );
};

const Thread = ({ data, onSent }) => {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [data.messages.length]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const { data: m } = await api.post("/chat/message", { message: text.trim() }, { headers: chatHeaders() });
      setText("");
      onSent(m);
    } catch { /* keep text so the customer can retry */ } finally { setBusy(false); }
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-neutral-50" data-testid="chat-messages">
        {!data.online && <p className="text-xs text-neutral-600 bg-white border border-neutral-200 rounded-lg px-3 py-2" data-testid="chat-offline-note">{data.offlineMessage}</p>}
        {data.messages.map((m) => (
          <div key={m.id} data-testid={`chat-msg-${m.sender}`} className={`flex ${m.sender === "customer" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${m.sender === "customer" ? "bg-emerald-600 text-white rounded-br-sm" : "bg-white border border-neutral-200 text-neutral-800 rounded-bl-sm"}`}>
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
              <p className={`text-[10px] mt-1 ${m.sender === "customer" ? "text-emerald-100" : "text-neutral-400"}`}>{m.sender === "customer" ? "You" : "Puff2door"} · {fmtTime(m.createdAt)}</p>
            </div>
          </div>
        ))}
        {data.conversation?.status === "resolved" && <p className="text-center text-[11px] text-neutral-400 pt-1" data-testid="chat-resolved-note">This conversation was marked resolved. Send a message to reopen it.</p>}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="p-3 border-t border-neutral-200 flex gap-2 bg-white">
        <input maxLength={2000} data-testid="chat-input" placeholder="Type a message…" className="flex-1 border border-neutral-300 rounded-full px-4 py-2.5 text-sm outline-none focus:border-emerald-600" value={text} onChange={(e) => setText(e.target.value)} />
        <button disabled={busy || !text.trim()} data-testid="chat-send" aria-label="Send" className="h-10 w-10 grid place-items-center rounded-full bg-neutral-900 text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors"><Send className="h-4 w-4" /></button>
      </form>
    </>
  );
};

const ChatWidget = () => {
  const { pathname } = useLocation();
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [unread, setUnread] = useState(0);
  const hasToken = Boolean(localStorage.getItem(TOKEN_KEY));

  const loadConversation = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    try {
      const { data: d } = await api.get("/chat/conversation", { headers: chatHeaders() });
      setData(d);
      setStatus((s) => ({ ...(s || {}), online: d.online, enabled: d.enabled, offlineMessage: d.offlineMessage }));
      setUnread(0);
    } catch (ex) {
      if (ex?.response?.status === 404 || ex?.response?.status === 401) { localStorage.removeItem(TOKEN_KEY); setData(null); }
    }
  }, []);

  useEffect(() => {
    api.get("/chat/status").then(({ data: s }) => setStatus(s)).catch(() => setStatus({ enabled: false }));
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    loadConversation();
    const t = setInterval(loadConversation, 3000);
    return () => clearInterval(t);
  }, [open, loadConversation]);

  useEffect(() => {
    if (open || !hasToken) return undefined;
    const peek = () => api.get("/chat/unread", { headers: chatHeaders() }).then(({ data: d }) => setUnread(d.unread || 0)).catch(() => {});
    peek();
    const t = setInterval(peek, 10000);
    return () => clearInterval(t);
  }, [open, hasToken]);

  if (pathname.startsWith("/admin") || !status || !status.enabled) return null;

  return (
    <>
      {!open && (
        <button type="button" data-testid="chat-launcher" onClick={() => setOpen(true)} aria-label="Chat with us"
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[60] inline-flex items-center gap-2 p-3.5 sm:pl-4 sm:pr-5 sm:py-3 rounded-full bg-neutral-900 text-white shadow-xl hover:bg-emerald-600 transition-colors">
          <span className="relative"><MessageCircle className="h-6 w-6 sm:h-5 sm:w-5" /><span className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-neutral-900 ${status.online ? "bg-emerald-400" : "bg-neutral-400"}`} /></span>
          <span className="hidden sm:inline text-sm font-bold">Chat with us</span>
          {unread > 0 && <span data-testid="chat-unread-badge" className="absolute -top-1.5 -left-1.5 sm:static sm:ml-1 text-[11px] font-bold bg-emerald-500 text-white rounded-full px-1.5 py-0.5">{unread}</span>}
        </button>
      )}
      {open && (
        <div data-testid="chat-window" className="fixed z-[60] inset-x-0 bottom-0 sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[380px] h-[85vh] sm:h-[560px] sm:max-h-[calc(100vh-48px)] bg-white sm:rounded-2xl shadow-2xl border border-neutral-200 flex flex-col overflow-hidden">
          <div className="bg-neutral-900 text-white px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-heading text-lg uppercase tracking-wide leading-none">Puff<span className="text-emerald-500">2</span>Door Support</p>
              <p className="text-[11px] text-neutral-400 mt-0.5">{status.online ? "We usually reply in a few minutes" : "We'll reply by email or phone"}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusDot online={status.online} />
              <button type="button" data-testid="chat-close" onClick={() => setOpen(false)} aria-label="Close chat" className="h-8 w-8 grid place-items-center rounded-full hover:bg-white/10"><X className="h-4 w-4" /></button>
            </div>
          </div>
          {data ? <Thread data={data} onSent={(m) => setData((d) => ({ ...d, messages: [...d.messages, m] }))} /> : hasToken ? <p className="p-4 text-sm text-neutral-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading your conversation…</p> : <StartForm status={status} onStarted={(d) => setData(d)} />}
        </div>
      )}
    </>
  );
};

export default ChatWidget;
