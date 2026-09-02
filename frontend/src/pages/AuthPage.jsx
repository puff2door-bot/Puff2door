import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useToast } from "../hooks/use-toast";
import { usStates } from "../mock";

const AuthPage = () => {
  const { user, setUser } = useApp();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState("login");
  const [login, setLogin] = useState({ email: "", password: "" });
  const [reg, setReg] = useState({ email: "", password: "", firstName: "", lastName: "", address: "", state: "", city: "", zip: "", phone: "" });

  const doLogin = (e) => {
    e.preventDefault();
    setUser({ email: login.email, firstName: login.email.split("@")[0] });
    toast({ title: "Welcome back!", description: "You are now logged in (demo)." });
    navigate("/");
  };
  const doRegister = (e) => {
    e.preventDefault();
    setUser({ email: reg.email, firstName: reg.firstName, lastName: reg.lastName });
    toast({ title: "Account created", description: "Registration successful (demo)." });
    navigate("/");
  };
  const logout = () => { setUser(null); toast({ title: "Logged out" }); };

  const inputCls = "w-full border border-neutral-300 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-emerald-600 transition-colors";

  if (user) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-16">
        <div className="max-w-md mx-auto text-center border border-neutral-200 rounded-2xl p-10">
          <div className="h-16 w-16 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center mx-auto mb-4 font-heading text-2xl">
            {(user.firstName || "U").charAt(0).toUpperCase()}
          </div>
          <h1 className="font-heading text-2xl mb-1">Hi, {user.firstName || "Member"}!</h1>
          <p className="text-neutral-500 text-sm mb-6">{user.email}</p>
          <button onClick={logout} className="px-6 py-2.5 bg-neutral-900 text-white font-bold rounded-full hover:bg-emerald-600 transition-colors">Log Out</button>
        </div>
      </div>
    );
  }

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
              <input required type="email" className={inputCls} value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Password <span className="text-red-500">*</span></label>
              <input required type="password" className={inputCls} value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-emerald-600" /> Remember me</label>
              <a href="#" className="text-emerald-600 hover:underline">Lost your password?</a>
            </div>
            <button className="w-full py-3 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors">Log In</button>
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
            <button className="sm:col-span-2 py-3 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors">Register</button>
          </form>
        )}
      </div>
    </div>
  );
};

export default AuthPage;
