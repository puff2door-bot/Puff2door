import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Package, LogOut, ChevronRight } from "lucide-react";
import { useApp } from "../context/AppContext";
import { useToast } from "../hooks/use-toast";
import { usStates } from "../mock";
import api from "../api";

const STATUS_LABEL = {
  placed: "Order Placed",
  confirmed: "Confirmed",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
};

const AccountView = () => {
  const { user, logout } = useApp();
  const { toast } = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/orders").then(({ data }) => setOrders(data.orders || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-[1280px] mx-auto px-4 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8">
        <div className="border border-neutral-200 rounded-2xl p-8 h-fit text-center">
          <div className="h-16 w-16 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center mx-auto mb-4 font-heading text-2xl">
            {(user.firstName || "U").charAt(0).toUpperCase()}
          </div>
          <h1 className="font-heading text-xl mb-1">Hi, {user.firstName || "Member"}!</h1>
          <p className="text-neutral-500 text-sm mb-6 break-all">{user.email}</p>
          <button onClick={() => { logout(); toast({ title: "Logged out" }); }} className="inline-flex items-center gap-2 px-6 py-2.5 bg-neutral-900 text-white font-bold rounded-full hover:bg-emerald-600 transition-colors text-sm">
            <LogOut className="h-4 w-4" /> Log Out
          </button>
        </div>

        <div>
          <h2 className="font-heading text-2xl uppercase tracking-wide mb-5 flex items-center gap-2">
            <Package className="h-6 w-6 text-emerald-600" /> My Orders
          </h2>
          {loading ? (
            <p className="text-neutral-500">Loading orders...</p>
          ) : orders.length === 0 ? (
            <div className="border border-dashed border-neutral-300 rounded-xl p-10 text-center">
              <p className="text-neutral-500 mb-4">You haven't placed any orders yet.</p>
              <Link to="/shop" className="inline-block px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-full">Start Shopping</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((o) => (
                <Link key={o.id} to={`/order/${o.id}`} className="block border border-neutral-200 rounded-xl p-5 hover:border-emerald-300 hover:shadow-md transition-all">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="font-heading text-lg">{o.orderNumber}</p>
                      <p className="text-xs text-neutral-500">{new Date(o.createdAt).toLocaleString()} · {o.items.length} item(s)</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${o.status === "delivered" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {STATUS_LABEL[o.status]}
                      </span>
                      <span className="font-heading text-lg">${o.total.toFixed(2)}</span>
                      <ChevronRight className="h-5 w-5 text-neutral-400" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const AuthPage = () => {
  const { user, login, register, authLoading } = useApp();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState("login");
  const [busy, setBusy] = useState(false);
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [reg, setReg] = useState({ email: "", password: "", firstName: "", lastName: "", address: "", state: "", city: "", zip: "", phone: "" });

  const doLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(loginData.email, loginData.password);
      toast({ title: "Welcome back!" });
      navigate("/");
    } catch (err) {
      toast({ title: "Login failed", description: err?.response?.data?.detail || "Try again", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const doRegister = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await register(reg);
      toast({ title: "Account created", description: "Welcome to Puff2Door!" });
      navigate("/");
    } catch (err) {
      toast({ title: "Registration failed", description: err?.response?.data?.detail || "Try again", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const inputCls = "w-full border border-neutral-300 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-emerald-600 transition-colors";

  if (authLoading) return <div className="max-w-[1280px] mx-auto px-4 py-24 text-center text-neutral-500">Loading...</div>;
  if (user) return <AccountView />;

  return (
    <div className="max-w-[1280px] mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-center gap-1 mb-8 border-b">
          {["login", "register"].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-8 py-3 font-heading text-lg uppercase tracking-wide border-b-2 transition-colors ${tab === t ? "border-emerald-600 text-emerald-700" : "border-transparent text-neutral-400 hover:text-neutral-700"}`}>
              {t}
            </button>
          ))}
        </div>

        {tab === "login" ? (
          <form onSubmit={doLogin} className="max-w-md mx-auto space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Username or email <span className="text-red-500">*</span></label>
              <input required type="email" className={inputCls} value={loginData.email} onChange={(e) => setLoginData({ ...loginData, email: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Password <span className="text-red-500">*</span></label>
              <input required type="password" className={inputCls} value={loginData.password} onChange={(e) => setLoginData({ ...loginData, password: e.target.value })} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-emerald-600" /> Remember me</label>
              <a href="#" className="text-emerald-600 hover:underline">Lost your password?</a>
            </div>
            <button disabled={busy} className="w-full py-3 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors disabled:opacity-60">{busy ? "Logging in..." : "Log In"}</button>
          </form>
        ) : (
          <form onSubmit={doRegister} className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><label className="block text-sm font-medium mb-1.5">Email address <span className="text-red-500">*</span></label><input required type="email" className={inputCls} value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className="block text-sm font-medium mb-1.5">Password <span className="text-red-500">*</span></label><input required type="password" className={inputCls} value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} /></div>
            <div><label className="block text-sm font-medium mb-1.5">First Name <span className="text-red-500">*</span></label><input required className={inputCls} value={reg.firstName} onChange={(e) => setReg({ ...reg, firstName: e.target.value })} /></div>
            <div><label className="block text-sm font-medium mb-1.5">Last Name <span className="text-red-500">*</span></label><input required className={inputCls} value={reg.lastName} onChange={(e) => setReg({ ...reg, lastName: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className="block text-sm font-medium mb-1.5">Street Address <span className="text-red-500">*</span></label><input required className={inputCls} value={reg.address} onChange={(e) => setReg({ ...reg, address: e.target.value })} /></div>
            <div><label className="block text-sm font-medium mb-1.5">State <span className="text-red-500">*</span></label><select required className={inputCls} value={reg.state} onChange={(e) => setReg({ ...reg, state: e.target.value })}><option value="">Select a state...</option>{usStates.map((s) => (<option key={s} value={s}>{s}</option>))}</select></div>
            <div><label className="block text-sm font-medium mb-1.5">Town / City <span className="text-red-500">*</span></label><input required className={inputCls} value={reg.city} onChange={(e) => setReg({ ...reg, city: e.target.value })} /></div>
            <div><label className="block text-sm font-medium mb-1.5">ZIP Code <span className="text-red-500">*</span></label><input required className={inputCls} value={reg.zip} onChange={(e) => setReg({ ...reg, zip: e.target.value })} /></div>
            <div><label className="block text-sm font-medium mb-1.5">USA Phone <span className="text-red-500">*</span></label><input required className={inputCls} value={reg.phone} onChange={(e) => setReg({ ...reg, phone: e.target.value })} /></div>
            <p className="sm:col-span-2 text-xs text-neutral-500">Your personal data will be used to support your experience throughout this website and for purposes described in our privacy policy.</p>
            <button disabled={busy} className="sm:col-span-2 py-3 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors disabled:opacity-60">{busy ? "Creating..." : "Register"}</button>
          </form>
        )}
      </div>
    </div>
  );
};

export default AuthPage;
