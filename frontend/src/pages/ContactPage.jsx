import React, { useState } from "react";
import { Phone, Mail, MapPin, Clock, Send } from "lucide-react";
import { BRAND } from "../mock";
import { useToast } from "../hooks/use-toast";
import Seo from "../seo/Seo";
import { breadcrumbJsonLd, faqJsonLd, LOCAL_FAQS, STORE } from "../seo/config";
import VisitStore from "../components/VisitStore";
import LocalFaq from "../components/LocalFaq";

const CONTACT_FAQS = [
  ...LOCAL_FAQS,
  { q: "Is this the old Bald Guy Smoke Shop 5?", a: "No. HD Smoke Shop is under new ownership at this location, 481 N State Rd 434, Suite 1050, Altamonte Springs." },
];
import api from "../api";

const ContactPage = () => {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/contact", form);
      toast({ title: "Message sent!", description: data.message });
      setForm({ name: "", email: "", subject: "", message: "" });
    } catch (err) {
      toast({ title: "Message wasn't sent", description: err?.response?.data?.detail || "Please try again or call us.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  const inputCls = "w-full border border-neutral-300 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-emerald-600 transition-colors";
  const info = [
    { icon: Phone, t: "Phone", v: STORE.phone, href: STORE.phoneHref },
    { icon: Mail, t: "Email", v: BRAND.email, href: `mailto:${BRAND.email}` },
    { icon: MapPin, t: "Address", v: STORE.fullAddress, href: STORE.directionsUrl, external: true },
    { icon: Clock, t: "Hours", v: "Open 10 AM – 10 PM, 7 days a week" },
  ];
  return (
    <div className="max-w-[1280px] mx-auto px-4 py-10">
      <Seo
        title="Contact & Directions – HD Smoke Shop Altamonte Springs"
        description="Call (407) 625-6826 or visit 481 N State Rd 434, Suite 1050, Altamonte Springs, FL 32714. Open 10 AM–10 PM every day."
        path="/contact"
        jsonLd={[breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Contact", path: "/contact" }]), faqJsonLd(CONTACT_FAQS)]}
      />
      <div className="relative overflow-hidden rounded-xl bg-neutral-900 px-8 py-12 mb-10 text-center">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-emerald-600/20 blur-2xl" />
        <h1 className="font-heading text-4xl font-700 text-white uppercase tracking-tight relative">Contact &amp; Directions</h1>
        <p className="text-neutral-300 mt-3 relative">Visit our Altamonte Springs store or order for delivery. Questions about an order or product? We're here to help.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-10">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1.5">Name</label><input required className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="block text-sm font-medium mb-1.5">Email</label><input required type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div><label className="block text-sm font-medium mb-1.5">Subject</label><input required className={inputCls} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
          <div><label className="block text-sm font-medium mb-1.5">Message</label><textarea required rows={6} className={inputCls} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
          <button disabled={busy} className="inline-flex items-center gap-2 px-7 py-3 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors disabled:opacity-60">{busy ? "Sending…" : "Send Message"} <Send className="h-4 w-4" /></button>
        </form>
        <div className="space-y-4">
          {info.map((i, k) => (
            <div key={k} className="flex items-start gap-4 border border-neutral-200 rounded-xl p-5">
              <span className="grid place-items-center h-11 w-11 rounded-full bg-emerald-100 text-emerald-700 shrink-0"><i.icon className="h-5 w-5" /></span>
              <div><p className="font-semibold text-sm">{i.t}</p>{i.href ? <a href={i.href} {...(i.external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="text-sm text-emerald-700 hover:underline">{i.v}</a> : <p className="text-sm text-neutral-500">{i.v}</p>}</div>
            </div>
          ))}
        </div>
      </div>
      <VisitStore className="mt-12" />
      <div className="mt-12 max-w-3xl">
        <LocalFaq faqs={CONTACT_FAQS} heading="Store & Delivery FAQ" testId="contact-faq" />
      </div>
    </div>
  );
};

export default ContactPage;
