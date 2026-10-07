import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Package, LogOut, ChevronRight, KeyRound } from "lucide-react";
import { PasswordInput, isStrongEnough, formatApiError } from "../components/PasswordInput";
import { useApp } from "../context/AppContext";
import { useToast } from "../hooks/use-toast";
import { usStates } from "../mock";
import api from "../api";
import MyRewards from "../components/account/MyRewards";

const STATUS_LABEL = {
  placed: "Order Placed",
  confirmed: "Confirmed",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
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
          <div className="h-16 w-16 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center mx-auto mb-4 font-heading text-2xl overflow-hidden">
            {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : (user.firstName || "U").charAt(0).toUpperCase()}
          </div>
          <h1 className="font-heading text-xl mb-1" data-testid="account-greeting">Hi, {user.firstName || "Member"}!</h1>
          <p className="text-neutral-500 text-sm mb-6 break-all">{user.email}</p>
          <Link to="/wishlist" className="block text-sm font-semibold text-emerald-600 hover:underline mb-4">View Wishlist</Link>
          {user.role === "admin" && <Link to="/admin" data-testid="account-admin-link" className="block text-sm font-bold text-amber-600 hover:underline mb-4">Open Admin Panel</Link>}
          <button data-testid="logout-btn" onClick={() => { logout(); toast({ title: "Logged out" }); }} className="inline-flex items-center gap-2 px-6 py-2.5 bg-neutral-900 text-white font-bold rounded-full hover:bg-emerald-600 transition-colors text-sm">
            <LogOut className="h-4 w-4" /> Log Out
          </button>
        </div>

        <div>
          <MyRewards />
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
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${o.status === "delivered" ? "bg-emerald-100 text-emerald-700" : o.status === "cancelled" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
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

const GoogleButton = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    data-testid="google-login-btn"
    className="w-full flex items-center justify-center gap-3 py-3 border-2 border-neutral-900 rounded-full font-bold text-sm text-neutral-900 hover:bg-neutral-900 hover:text-white transition-colors"
  >
    <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.5 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.4 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6C44.1 37.6 46.5 31.6 46.5 24.5z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.3 0 11.7-2.1 15.6-5.7l-7.7-6c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.6-3.9-13.5-9.4l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
    Continue with Google
  </button>
);

const Divider = () => (
  <div className="flex items-center gap-3 text-xs text-neutral-400 uppercase tracking-widest">
    <span className="h-px flex-1 bg-neutral-200" /> or <span className="h-px flex-1 bg-neutral-200" />
  </div>
);

const AuthPage = () => {
  const { user, login, register, resetPassword, loginWithGoogle, authLoading } = useApp();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const resetToken = searchParams.get("reset_token") || "";
  const [tab, setTab] = useState("login");
  const [mode, setMode] = useState(resetToken ? "reset" : "auth");
  const [busy, setBusy] = useState(false);
  const [loginData, setLoginData] = useState({ email: "", password: "", rememberMe: false });
  const [reg, setReg] = useState({ email: "", password: "", firstName: "", lastName: "", address: "", state: "", city: "", zip: "", phone: "" });
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotResult, setForgotResult] = useState(null);
  const [newPassword, setNewPassword] = useState("");

  const fail = (title, err) => toast({ title, description: formatApiError(err?.response?.data?.detail, err?.message || "Try again"), variant: "destructive" });

  const doGoogle = async () => {
    setBusy(true);
    try {
      await loginWithGoogle();
      toast({ title: "Welcome to Puff2Door!" });
      navigate("/my-account");
    } catch (err) {
      fail("Google sign-in failed", err);
    } finally {
      setBusy(false);
    }
  };

  const doLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(loginData.email, loginData.password, loginData.rememberMe);
      toast({ title: "Welcome back!", description: loginData.rememberMe ? "We'll keep you signed in for 30 days." : undefined });
      navigate("/");
    } catch (err) {
      fail("Login failed", err);
    } finally { setBusy(false); }
  };

  const doRegister = async (e) => {
    e.preventDefault();
    if (!isStrongEnough(reg.password)) return toast({ title: "Weak password", description: "Use at least 8 characters with a letter and a number.", variant: "destructive" });
    setBusy(true);
    try {
      const created = await register(reg);
      toast({ title: "Account created", description: created.signupBonusPoints ? `Welcome to Puff2Door! ${created.signupBonusPoints} bonus rewards points were added to your account.` : "Welcome to Puff2Door!" });
      navigate("/my-account");
    } catch (err) {
      fail("Registration failed", err);
    } finally { setBusy(false); }
  };

  const doForgot = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/auth/forgot-password", { email: forgotEmail });
      setForgotResult(data);
    } catch (err) {
      fail("Could not start reset", err);
    } finally { setBusy(false); }
  };

  const doReset = async (e) => {
    e.preventDefault();
    if (!isStrongEnough(newPassword)) return toast({ title: "Weak password", description: "Use at least 8 characters with a letter and a number.", variant: "destructive" });
    setBusy(true);
    try {
      await resetPassword(resetToken, newPassword);
      toast({ title: "Password updated", description: "You're now signed in." });
      setSearchParams({});
      navigate("/my-account", { replace: true });
    } catch (err) {
      fail("Reset failed", err);
    } finally { setBusy(false); }
  };

  const inputCls = "w-full border border-neutral-300 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-emerald-600 transition-colors";

  if (authLoading) return <div className="max-w-[1280px] mx-auto px-4 py-24 text-center text-neutral-500">Loading...</div>;
  if (user) return <AccountView />;

  if (mode === "reset") {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-12">
        <form onSubmit={doReset} data-testid="reset-password-form" className="max-w-md mx-auto space-y-4">
          <div className="text-center mb-6">
            <h1 className="font-heading text-3xl uppercase tracking-wide mb-1">Set a new password</h1>
            <p className="text-sm text-neutral-500">Choose a strong password for your account.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">New password <span className="text-red-500">*</span></label>
            <PasswordInput testId="reset-password-input" className={inputCls} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} showStrength autoComplete="new-password" />
          </div>
          <button disabled={busy} data-testid="reset-password-submit" className="w-full py-3 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors disabled:opacity-60">{busy ? "Updating..." : "Update Password"}</button>
          <button type="button" onClick={() => { setSearchParams({}); setMode("auth"); }} className="w-full text-sm text-neutral-500 hover:text-emerald-600">Back to login</button>
        </form>
      </div>
    );
  }

  if (mode === "forgot") {
    const resetLink = forgotResult?.resetToken ? `${window.location.origin}/my-account?reset_token=${forgotResult.resetToken}` : null;
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-12">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-6">
            <h1 className="font-heading text-3xl uppercase tracking-wide mb-1">Reset your password</h1>
            <p className="text-sm text-neutral-500">Enter your account email and we'll generate a reset link.</p>
          </div>
          {forgotResult ? (
            <div data-testid="forgot-result" className="border border-emerald-200 bg-emerald-50 rounded-xl p-5 space-y-3">
              <p className="text-sm text-emerald-800 flex items-start gap-2"><KeyRound className="h-4 w-4 mt-0.5 shrink-0" /> {forgotResult.message}</p>
              {forgotResult.emailSent && <p data-testid="forgot-email-sent" className="text-xs text-neutral-600">Check your inbox — the reset link is valid for {forgotResult.expiresInMinutes} minutes. Don't forget to look in spam.</p>}
              {resetLink && (
                <>
                  <p className="text-xs text-neutral-600">We couldn't email you right now, so here is your one-time reset link (valid {forgotResult.expiresInMinutes} min):</p>
                  <Link to={`/my-account?reset_token=${forgotResult.resetToken}`} onClick={() => setMode("reset")} data-testid="reset-link" className="block break-all text-xs font-mono bg-white border border-emerald-200 rounded-lg p-3 text-emerald-700 hover:underline">{resetLink}</Link>
                </>
              )}
              <button type="button" onClick={() => { setForgotResult(null); setMode("auth"); }} className="w-full text-sm text-neutral-500 hover:text-emerald-600">Back to login</button>
            </div>
          ) : (
            <form onSubmit={doForgot} data-testid="forgot-password-form" className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Email address <span className="text-red-500">*</span></label>
                <input required type="email" data-testid="forgot-email-input" className={inputCls} value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
              </div>
              <button disabled={busy} data-testid="forgot-submit" className="w-full py-3 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors disabled:opacity-60">{busy ? "Generating..." : "Send Reset Link"}</button>
              <button type="button" onClick={() => setMode("auth")} className="w-full text-sm text-neutral-500 hover:text-emerald-600">Back to login</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-center gap-1 mb-8 border-b">
          {["login", "register"].map((t) => (
            <button key={t} data-testid={`auth-tab-${t}`} onClick={() => setTab(t)} className={`px-8 py-3 font-heading text-lg uppercase tracking-wide border-b-2 transition-colors ${tab === t ? "border-emerald-600 text-emerald-700" : "border-transparent text-neutral-400 hover:text-neutral-700"}`}>
              {t}
            </button>
          ))}
        </div>

        {tab === "login" ? (
          <form onSubmit={doLogin} data-testid="login-form" className="max-w-md mx-auto space-y-4">
            <GoogleButton onClick={doGoogle} />
            <Divider />
            <div>
              <label className="block text-sm font-medium mb-1.5">Email <span className="text-red-500">*</span></label>
              <input required type="email" data-testid="login-email" autoComplete="email" className={inputCls} value={loginData.email} onChange={(e) => setLoginData({ ...loginData, email: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Password <span className="text-red-500">*</span></label>
              <PasswordInput testId="login-password" className={inputCls} value={loginData.password} onChange={(e) => setLoginData({ ...loginData, password: e.target.value })} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" data-testid="remember-me" className="accent-emerald-600 h-4 w-4" checked={loginData.rememberMe} onChange={(e) => setLoginData({ ...loginData, rememberMe: e.target.checked })} /> Remember me for 30 days</label>
              <button type="button" data-testid="forgot-password-link" onClick={() => { setForgotEmail(loginData.email); setMode("forgot"); }} className="text-emerald-600 hover:underline">Lost your password?</button>
            </div>
            <button disabled={busy} data-testid="login-submit" className="w-full py-3 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors disabled:opacity-60">{busy ? "Logging in..." : "Log In"}</button>
          </form>
        ) : (
          <form onSubmit={doRegister} data-testid="register-form" className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 max-w-md mx-auto w-full space-y-4"><GoogleButton onClick={doGoogle} /><Divider /></div>
            <div className="sm:col-span-2"><label className="block text-sm font-medium mb-1.5">Email address <span className="text-red-500">*</span></label><input required type="email" data-testid="register-email" autoComplete="email" className={inputCls} value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className="block text-sm font-medium mb-1.5">Password <span className="text-red-500">*</span></label><PasswordInput testId="register-password" className={inputCls} value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} showStrength autoComplete="new-password" /></div>
            <div><label className="block text-sm font-medium mb-1.5">First Name <span className="text-red-500">*</span></label><input required data-testid="register-first-name" className={inputCls} value={reg.firstName} onChange={(e) => setReg({ ...reg, firstName: e.target.value })} /></div>
            <div><label className="block text-sm font-medium mb-1.5">Last Name <span className="text-red-500">*</span></label><input required data-testid="register-last-name" className={inputCls} value={reg.lastName} onChange={(e) => setReg({ ...reg, lastName: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className="block text-sm font-medium mb-1.5">Street Address <span className="text-red-500">*</span></label><input required data-testid="register-address" className={inputCls} value={reg.address} onChange={(e) => setReg({ ...reg, address: e.target.value })} /></div>
            <div><label className="block text-sm font-medium mb-1.5">State <span className="text-red-500">*</span></label><select required data-testid="register-state" className={inputCls} value={reg.state} onChange={(e) => setReg({ ...reg, state: e.target.value })}><option value="">Select a state...</option>{usStates.map((s) => (<option key={s} value={s}>{s}</option>))}</select></div>
            <div><label className="block text-sm font-medium mb-1.5">Town / City <span className="text-red-500">*</span></label><input required data-testid="register-city" className={inputCls} value={reg.city} onChange={(e) => setReg({ ...reg, city: e.target.value })} /></div>
            <div><label className="block text-sm font-medium mb-1.5">ZIP Code <span className="text-red-500">*</span></label><input required data-testid="register-zip" className={inputCls} value={reg.zip} onChange={(e) => setReg({ ...reg, zip: e.target.value })} /></div>
            <div><label className="block text-sm font-medium mb-1.5">USA Phone <span className="text-red-500">*</span></label><input required data-testid="register-phone" className={inputCls} value={reg.phone} onChange={(e) => setReg({ ...reg, phone: e.target.value })} /></div>
            <p className="sm:col-span-2 text-xs text-neutral-500">Your personal data will be used to support your experience throughout this website and for purposes described in our privacy policy.</p>
            <button disabled={busy} data-testid="register-submit" className="sm:col-span-2 py-3 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors disabled:opacity-60">{busy ? "Creating..." : "Register"}</button>
          </form>
        )}
      </div>
    </div>
  );
};

export default AuthPage;
