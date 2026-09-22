import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, MailX, Mail } from "lucide-react";
import api from "../../api";

const tone = { sent: "bg-emerald-100 text-emerald-700", failed: "bg-red-100 text-red-700", disabled: "bg-neutral-200 text-neutral-600" };

const AdminEmails = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/admin/emails").then((r) => setData(r.data)).catch(() => setData({ emails: [], enabled: false, from: "" }));
  }, []);

  if (!data) return <p className="text-neutral-500">Loading...</p>;
  const testMode = /resend\.dev/i.test(data.from || "");
  const failed = data.emails.filter((e) => e.status === "failed").length;

  return (
    <div data-testid="admin-emails">
      <h1 className="font-heading text-3xl uppercase tracking-tight mb-2">Email Log</h1>
      <p className="text-sm text-neutral-500 mb-5">Order confirmations, payment receipts, shipping updates, password resets and restock alerts sent by the store.</p>

      <div className={`rounded-2xl border p-4 mb-6 flex gap-3 ${!data.enabled ? "border-red-200 bg-red-50" : testMode ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`} data-testid="email-status-banner">
        {!data.enabled ? <MailX className="h-5 w-5 text-red-600 shrink-0" /> : testMode ? <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" /> : <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />}
        <div className="text-sm">
          {!data.enabled ? (
            <p className="font-semibold text-red-800">Email sending is disabled — no Resend API key configured.</p>
          ) : testMode ? (
            <>
              <p className="font-semibold text-amber-800">Test mode: sending from {data.from}</p>
              <p className="text-amber-800/90 mt-1">Resend only delivers test-mode emails to your own account address (puff2door@gmail.com). Emails to customers will show as <strong>failed</strong> here until you verify your domain at <span className="font-mono">resend.com/domains</span> and we switch the sender to e.g. <span className="font-mono">orders@puff2door.com</span>. Customers still see reset links / Zelle instructions in the app, so nothing is blocked.</p>
            </>
          ) : (
            <p className="font-semibold text-emerald-800">Live: sending from {data.from}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 mb-3 text-sm text-neutral-600"><Mail className="h-4 w-4" /> {data.emails.length} recent · <span className="text-red-600 font-semibold">{failed} failed</span></div>

      {data.emails.length === 0 ? (
        <p className="text-neutral-500 border border-dashed rounded-2xl p-10 text-center">No emails sent yet.</p>
      ) : (
        <div className="border border-neutral-200 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-[11px] uppercase tracking-wide text-neutral-500">
              <tr><th className="px-4 py-3">When</th><th className="px-4 py-3">To</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody className="divide-y">
              {data.emails.map((e, i) => (
                <tr key={i} data-testid={`email-row-${i}`} className="align-top">
                  <td className="px-4 py-3 text-xs text-neutral-500 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-neutral-700 break-all">{(e.to || []).join(", ")}</td>
                  <td className="px-4 py-3">
                    <p className="text-neutral-900">{e.subject}</p>
                    {e.error && <p className="text-xs text-red-600 mt-1">{e.error}</p>}
                  </td>
                  <td className="px-4 py-3"><span className={`text-xs font-bold px-2.5 py-1 rounded-full ${tone[e.status] || tone.disabled}`}>{e.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminEmails;
