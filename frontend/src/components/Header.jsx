import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  ShoppingCart,
  User,
  Menu,
  X,
  ChevronDown,
  Phone,
  MapPin,
  Heart,
  Moon,
  Sun,
} from "lucide-react";
import { announcements, BRAND } from "../mock";
import { useCatalog } from "../context/CatalogContext";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import { useApp } from "../context/AppContext";
import AnimatedLogo from "./AnimatedLogo";
import SmartSearch from "./SmartSearch";
import MixSaveBuilder, { MixSaveButton } from "./MixSaveBuilder";

const Header = () => {
  const navigate = useNavigate();
  const { count, delivery, presentation } = useCart();
  const { count: wishCount } = useWishlist();
  const { user } = useApp();
  const { activeCategories: categories, activeBrands: brands } = useCatalog();
  const [scrolled, setScrolled] = useState(false);
  const [installHelp, setInstallHelp] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [openMenu, setOpenMenu] = useState(null);
  const [dark, setDark] = useState(() => localStorage.getItem("p2d_theme") === "dark");
  const [mixSaveOpen, setMixSaveOpen] = useState(false);
  const [mixSaveInitial, setMixSaveInitial] = useState(null);
  // The private feature-review build must keep Live Shelf visible even when the
  // production settings request is unavailable. Production still respects the
  // administrator's Live Shelf on/off setting.
  const liveShelfVisible = presentation.liveShelfEnabled || process.env.REACT_APP_MIX_SAVE_PREVIEW === "1";
  const visibleAnnouncements = announcements.filter((text) => delivery.sameDayEnabled === true || !text.includes("SAME-DAY"));

  useEffect(() => {
    document.documentElement.classList.toggle("p2d-dark", dark);
    localStorage.setItem("p2d_theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const openBuilder = (event) => { setMixSaveInitial(event.detail?.productId || null); setMixSaveOpen(true); };
    window.addEventListener("p2d-open-mix-save", openBuilder);
    return () => window.removeEventListener("p2d-open-mix-save", openBuilder);
  }, []);

  const submitSearch = (e) => {
    e.preventDefault();
    if (query.trim()) navigate(`/shop?search=${encodeURIComponent(query.trim())}`);
  };

  return (
    <header className="sticky top-0 z-50 w-full">
      {/* Announcement marquee */}
      <div className="bg-neutral-900 text-white overflow-hidden">
        <div className="flex whitespace-nowrap animate-marquee">
          {[...visibleAnnouncements, ...visibleAnnouncements, ...visibleAnnouncements, ...visibleAnnouncements].map((a, i) => (
            <span key={i} className="mx-8 py-2 text-[11px] tracking-[0.2em] font-medium flex items-center">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-3" />
              {a}
            </span>
          ))}
        </div>
      </div>

      {presentation?.downloadAppEnabled && <div className="bg-emerald-950 text-white text-center py-2"><button type="button" data-testid="download-app-button" onClick={() => setInstallHelp(true)} className="text-xs font-bold underline">Download App</button></div>}
      {presentation?.downloadAppEnabled && installHelp && <div role="dialog" aria-modal="true" aria-label="Install app" className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4"><div className="bg-white text-neutral-900 rounded-xl p-6 max-w-sm"><h2 className="font-bold mb-3">Install Puff2Door</h2><p className="text-sm mb-4">On iPhone Safari, tap Share then Add to Home Screen. On Android or desktop, use the browser menu and select Install app or Add to Home Screen if available.</p><button type="button" onClick={() => setInstallHelp(false)} className="bg-emerald-700 text-white rounded-lg px-4 py-2">Close</button></div></div>}
      {/* Main bar */}
      <div className={`bg-white border-b transition-shadow ${scrolled ? "shadow-md" : ""}`}>
        <div className="max-w-[1280px] mx-auto px-4">
          <div className="flex items-center gap-2 sm:gap-4 h-[68px] sm:h-[76px]">
            <button className="lg:hidden p-2 -ml-2 shrink-0" onClick={() => setMobileOpen(true)} aria-label="Menu">
              <Menu className="h-6 w-6" />
            </button>

            <Link to="/" className="flex items-center gap-2 shrink-0 min-w-0">
              <AnimatedLogo testId="header-logo" className="h-10 w-10 sm:h-11 sm:w-11" />
              <span className="leading-none">
                <span className="block font-heading font-700 text-[17px] sm:text-[21px] tracking-tight text-neutral-900 whitespace-nowrap">
                  H<span className="p2d-logo-accent text-emerald-600">D</span> Smoke Shop
                </span>
                <span className="block text-[7px] sm:text-[9px] tracking-[0.13em] sm:tracking-[0.2em] text-neutral-500 uppercase whitespace-nowrap mt-0.5">
                  {BRAND.tagline}
                </span>
              </span>
            </Link>

            {/* Search */}
            <SmartSearch query={query} setQuery={setQuery} onSubmit={submitSearch} />

            <div className="flex items-center gap-0.5 sm:gap-1 ml-auto lg:ml-0 shrink-0">
              <button onClick={() => setDark((value) => !value)} data-testid="theme-toggle" aria-label={dark ? "Use light mode" : "Use dark mode"} className="p-2.5 rounded-lg hover:bg-neutral-100 transition-colors">
                {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
              <Link to="/my-account" className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-neutral-100 transition-colors">
                <User className="h-5 w-5" />
                <span className="text-xs leading-tight">
                  <span className="block text-neutral-500">{user ? "Hi," : "Account"}</span>
                  <span className="block font-semibold">{user ? user.firstName || "Member" : "Login"}</span>
                </span>
              </Link>
              <Link to="/wishlist" aria-label="Wishlist" data-testid="header-wishlist-link" className="relative flex items-center gap-2 px-2 sm:px-3 py-2 rounded-lg hover:bg-neutral-100 transition-colors">
                <div className="relative">
                  <Heart className="h-6 w-6" />
                  {wishCount > 0 && (
                    <span data-testid="header-wishlist-count" className="absolute -top-2 -right-2 h-5 w-5 grid place-items-center rounded-full bg-red-500 text-white text-[10px] font-bold">
                      {wishCount}
                    </span>
                  )}
                </div>
                <span className="hidden lg:block text-xs font-semibold">Wishlist</span>
              </Link>
              <Link to="/cart" aria-label={count > 0 ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart"} data-testid="header-cart-link" className="relative flex items-center gap-2 px-2 sm:px-3 py-2 rounded-lg hover:bg-neutral-100 transition-colors">
                <div className="relative">
                  <ShoppingCart className="h-6 w-6" />
                  {count > 0 && (
                    <span data-testid="header-cart-count" className="absolute -top-2 -right-2 h-5 w-5 grid place-items-center rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                      {count}
                    </span>
                  )}
                </div>
                <span className="hidden lg:block text-xs font-semibold">Cart</span>
              </Link>
            </div>
          </div>

          {/* Mobile search */}
          <SmartSearch query={query} setQuery={setQuery} onSubmit={submitSearch} mobile />
        </div>

        {/* Desktop nav */}
        <nav className="hidden lg:block bg-neutral-900">
          <div className="max-w-[1280px] mx-auto px-4">
            <ul className="flex items-center gap-1 text-white">
              <li
                className="relative"
                onMouseEnter={() => setOpenMenu("shop")}
                onMouseLeave={() => setOpenMenu(null)}
              >
                <Link to="/shop" className="flex items-center gap-1 px-4 py-3.5 text-[13px] font-semibold tracking-wide uppercase hover:text-emerald-400 transition-colors">
                  Shop <ChevronDown className="h-4 w-4" />
                </Link>
                {openMenu === "shop" && (
                  <div data-testid="shop-dropdown" className="absolute left-0 top-full w-[560px] bg-white text-neutral-800 shadow-2xl rounded-b-lg p-5 grid grid-cols-2 gap-1 animate-fade-up">
                    {categories.map((c) => (
                      <Link
                        key={c.slug}
                        to={`/product-category/${c.slug}`}
                        data-testid={`nav-cat-${c.slug}`}
                        className="px-3 py-2 rounded text-[13px] font-medium hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                      >
                        {c.name}
                      </Link>
                    ))}
                  </div>
                )}
              </li>

              <li
                className="relative"
                onMouseEnter={() => setOpenMenu("brands")}
                onMouseLeave={() => setOpenMenu(null)}
              >
                <Link to="/brands" className="flex items-center gap-1 px-4 py-3.5 text-[13px] font-semibold tracking-wide uppercase hover:text-emerald-400 transition-colors">
                  Brands <ChevronDown className="h-4 w-4" />
                </Link>
                {openMenu === "brands" && (
                  <div data-testid="brands-dropdown" className="absolute left-0 top-full w-[720px] max-h-[70vh] overflow-y-auto bg-white text-neutral-800 shadow-2xl rounded-b-lg p-5 grid grid-cols-4 gap-1 animate-fade-up">
                    {brands.map((b) => (
                      <Link
                        key={b.slug}
                        to={`/brand/${b.slug}`}
                        data-testid={`nav-brand-${b.slug}`}
                        className="px-3 py-2 rounded text-[13px] font-medium hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                      >
                        {b.name}
                      </Link>
                    ))}
                  </div>
                )}
              </li>

              <li>
                <Link to="/about" className="block px-4 py-3.5 text-[13px] font-semibold tracking-wide uppercase hover:text-emerald-400 transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link to="/contact" className="block px-4 py-3.5 text-[13px] font-semibold tracking-wide uppercase hover:text-emerald-400 transition-colors">
                  Contact
                </Link>
              </li>
              <li>
                <Link to="/delivery-area" data-testid="nav-delivery-area" className="block px-4 py-3.5 text-[13px] font-semibold tracking-wide uppercase hover:text-emerald-400 transition-colors">
                  Delivery Area
                </Link>
              </li>
              <li>
                <Link to="/track" className="block px-4 py-3.5 text-[13px] font-semibold tracking-wide uppercase text-emerald-400 hover:text-emerald-300 transition-colors">
                  Track Order
                </Link>
              </li>
              {liveShelfVisible && <li><Link to="/live-shelf" data-testid="nav-live-shelf" className="block px-3 py-3.5 text-[13px] font-semibold tracking-wide uppercase text-sky-300 hover:text-sky-200 transition-colors">Live Shelf</Link></li>}
              <li><MixSaveButton onClick={() => { setMixSaveInitial(null); setMixSaveOpen(true); }} /></li>
              <li className="ml-auto flex items-center gap-5 text-[12px] text-neutral-300">
                <span className="flex items-center gap-1.5"><Phone className="h-4 w-4 text-emerald-400" /> {BRAND.phone}</span>
                <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-emerald-400" /> Altamonte Springs, FL</span>
              </li>
            </ul>
          </div>
        </nav>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[85%] max-w-sm bg-white shadow-xl overflow-y-auto animate-fade-up">
            <div className="flex items-center justify-between p-4 border-b">
              <span>
                <span className="block font-heading font-700 text-xl">H<span className="p2d-logo-accent text-emerald-600">D</span> Smoke Shop</span>
                <span className="block text-[8px] tracking-[0.16em] text-neutral-500 uppercase mt-0.5">{BRAND.tagline}</span>
              </span>
              <button onClick={() => setMobileOpen(false)}><X className="h-6 w-6" /></button>
            </div>
            <div className="p-4" data-testid="mobile-menu">
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Categories</p>
              <div className="flex flex-col" data-testid="mobile-categories">
                {categories.map((c) => (
                  <Link key={c.slug} to={`/product-category/${c.slug}`} onClick={() => setMobileOpen(false)} data-testid={`mobile-cat-${c.slug}`} className="py-2.5 text-sm font-medium border-b border-neutral-100 hover:text-emerald-600">
                    {c.name}
                  </Link>
                ))}
              </div>
              <details className="mt-5" data-testid="mobile-brands">
                <summary className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2 cursor-pointer list-none flex items-center justify-between">Brands ({brands.length}) <ChevronDown className="h-4 w-4" /></summary>
                <div className="flex flex-col">
                  {brands.map((b) => (
                    <Link key={b.slug} to={`/brand/${b.slug}`} onClick={() => setMobileOpen(false)} data-testid={`mobile-brand-${b.slug}`} className="py-2.5 text-sm font-medium border-b border-neutral-100 hover:text-emerald-600">
                      {b.name}
                    </Link>
                  ))}
                </div>
              </details>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mt-5 mb-2">More</p>
              <div className="flex flex-col">
                <Link to="/brands" onClick={() => setMobileOpen(false)} className="py-2.5 text-sm font-medium border-b border-neutral-100">All Brands</Link>
                <Link to="/about" onClick={() => setMobileOpen(false)} className="py-2.5 text-sm font-medium border-b border-neutral-100">About</Link>
                <Link to="/contact" onClick={() => setMobileOpen(false)} className="py-2.5 text-sm font-medium border-b border-neutral-100">Contact</Link>
                <Link to="/delivery-area" onClick={() => setMobileOpen(false)} data-testid="mobile-delivery-area" className="py-2.5 text-sm font-medium border-b border-neutral-100">Delivery Area</Link>
                <Link to="/track" onClick={() => setMobileOpen(false)} className="py-2.5 text-sm font-medium border-b border-neutral-100">Track Order</Link>
                <div className="grid grid-cols-2 gap-2 py-2 border-b border-neutral-100">
                  {liveShelfVisible && <Link to="/live-shelf" data-testid="mobile-live-shelf" onClick={() => setMobileOpen(false)} className="min-h-11 grid place-items-center rounded-lg border border-sky-200 bg-sky-50 px-2 text-center text-[11px] font-bold text-sky-700">Live Shelf</Link>}
                  <MixSaveButton compact onClick={() => { setMobileOpen(false); setMixSaveInitial(null); setMixSaveOpen(true); }} />
                </div>
                <Link to="/wishlist" onClick={() => setMobileOpen(false)} className="py-2.5 text-sm font-medium border-b border-neutral-100">Wishlist</Link>
                <Link to="/my-account" onClick={() => setMobileOpen(false)} className="py-2.5 text-sm font-medium border-b border-neutral-100">My Account</Link>
                {user?.role === "admin" && <Link to="/admin" onClick={() => setMobileOpen(false)} className="py-2.5 text-sm font-bold border-b border-neutral-100 text-amber-600">Admin Panel</Link>}
              </div>
            </div>
          </div>
        </div>
      )}
      <MixSaveBuilder open={mixSaveOpen} initialProductId={mixSaveInitial} onClose={() => { setMixSaveOpen(false); setMixSaveInitial(null); }} />
    </header>
  );
};

export default Header;
