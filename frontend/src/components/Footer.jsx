import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Phone, Mail, MapPin, Clock, Facebook, Instagram, Twitter } from "lucide-react";

const SOCIALS = [
  { name: "Facebook", href: "https://www.facebook.com/puff2doors", Icon: Facebook },
  { name: "Instagram", href: "https://www.instagram.com/hdsmokeshop.altamonte/", Icon: Instagram },
  { name: "Twitter", href: "https://twitter.com/puff2doors", Icon: Twitter },
];
import { BRAND } from "../mock";
import { STORE } from "../seo/config";
import { useCatalog } from "../context/CatalogContext";
import { useCart } from "../context/CartContext";
import AnimatedLogo from "./AnimatedLogo";
import { SalSays } from "./SalMascot";

// Sal shows in the footer everywhere except shopping pages (never near products) and the pages
// where he already talks (delivery pages, checkout, order tracking).
const NO_FOOTER_SAL = ["/shop", "/product-category", "/brand", "/brands", "/cart", "/wishlist", "/checkout", "/order", "/track", "/delivery-area", "/delivery"];
import { useApp } from "../context/AppContext";

const Footer = () => {
  const { delivery } = useCart();
  const { pathname } = useLocation();
  const { activeCategories: categories } = useCatalog();
  const { user } = useApp();
  return (
    <footer className="bg-neutral-900 text-neutral-300 mt-16">
      {/* Age banner */}
      <div className="bg-emerald-600 text-white">
        <div className="max-w-[1280px] mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="font-heading text-lg tracking-wide">MUST BE 21+ TO PURCHASE. SHOP RESPONSIBLY.</p>
          <Link to="/shop" className="px-5 py-2 bg-white text-emerald-700 rounded-full text-sm font-bold hover:bg-neutral-100 transition-colors">
            Start Shopping
          </Link>
        </div>
      </div>

      <div className="max-w-[1280px] mx-auto px-4 py-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <AnimatedLogo testId="footer-logo" className="h-10 w-10" />
            <span className="font-heading font-700 text-xl text-white">H<span className="p2d-logo-accent text-emerald-500">D</span> Smoke Shop</span>
          </div>
          <p className="text-sm leading-relaxed text-neutral-400">
            Your Altamonte Springs smoke shop for disposable vapes, delta, kratom, glass, papers and
            accessories. Walk-ins welcome, or order online for local delivery in ZIP 32714.
          </p>
          <div className="flex gap-3 mt-5">
            {SOCIALS.map(({ name, href, Icon }) => (
              <a
                key={name}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`HD Smoke Shop on ${name}`}
                data-testid={`social-${name.toLowerCase()}`}
                className="grid place-items-center h-9 w-9 rounded-full bg-neutral-800 hover:bg-emerald-600 transition-colors"
              >
                <Icon className="h-4 w-4 text-white" />
              </a>
            ))}
          </div>
        </div>

        <div>
          <p className="font-heading text-white text-base tracking-wide mb-4 uppercase">Shop</p>
          <ul className="space-y-2.5 text-sm">
            {categories.slice(0, 7).map((c) => (
              <li key={c.slug}>
                <Link to={`/product-category/${c.slug}`} className="hover:text-emerald-400 transition-colors">{c.name}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="font-heading text-white text-base tracking-wide mb-4 uppercase">Company</p>
          <ul className="space-y-2.5 text-sm">
            <li><Link to="/about" className="hover:text-emerald-400 transition-colors">About Us</Link></li>
            <li><Link to="/contact" className="hover:text-emerald-400 transition-colors">Contact</Link></li>
            <li><Link to="/faq" className="hover:text-emerald-400 transition-colors">FAQ</Link></li>
            <li><Link to="/guides" className="hover:text-emerald-400 transition-colors">Guides</Link></li>
            <li><Link to="/brands" className="hover:text-emerald-400 transition-colors">Brands</Link></li>
            <li><Link to="/request-product" className="hover:text-emerald-400 transition-colors">Request a Product</Link></li>
          </ul>
        </div>

        <div>
          <p className="font-heading text-white text-base tracking-wide mb-4 uppercase">Get In Touch</p>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-3"><Phone className="h-4 w-4 text-emerald-500 mt-0.5" /> <a href={STORE.phoneHref} className="hover:text-emerald-400 transition-colors">{STORE.phone}</a></li>
            <li className="flex items-start gap-3"><Mail className="h-4 w-4 text-emerald-500 mt-0.5" /> {BRAND.email}</li>
            <li className="flex items-start gap-3"><MapPin className="h-4 w-4 text-emerald-500 mt-0.5" /> <a href={STORE.directionsUrl} target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors">{STORE.fullAddress}</a></li>
            <li className="flex items-start gap-3"><Clock className="h-4 w-4 text-emerald-500 mt-0.5" /> Open {STORE.hoursText}</li>
          </ul>
          <p className="font-heading text-white text-base tracking-wide mt-7 mb-3 uppercase">Delivery</p>
          {!NO_FOOTER_SAL.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && (
            <SalSays spot="banner" size={48} className="mb-3" textClassName="text-xs text-neutral-300 leading-snug" />
          )}
          <ul className="space-y-2.5 text-sm">
            <li><Link to="/delivery-area" className="hover:text-emerald-400 transition-colors">Delivery Area (32714)</Link></li>
            {delivery?.lakeNonaEnabled && <li><Link to="/delivery/lake-nona" className="hover:text-emerald-400 transition-colors">Lake Nona Delivery (32832)</Link></li>}
            <li><Link to="/track" className="hover:text-emerald-400 transition-colors">Track Order</Link></li>
          </ul>
        </div>

        <div>
          <p className="font-heading text-white text-base tracking-wide mb-4 uppercase">Policies</p>
          <ul className="space-y-2.5 text-sm">
            <li><Link to="/privacy-policy" className="hover:text-emerald-400 transition-colors">Privacy Policy</Link></li>
            <li><Link to="/terms" className="hover:text-emerald-400 transition-colors">Terms &amp; Conditions</Link></li>
            <li><Link to="/delivery-policy" className="hover:text-emerald-400 transition-colors">Delivery Policy</Link></li>
            <li><Link to="/refund-policy" className="hover:text-emerald-400 transition-colors">Refund &amp; Return Policy</Link></li>
            <li><Link to="/age-and-id-policy" className="hover:text-emerald-400 transition-colors">Age &amp; ID Policy</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-neutral-800">
        <div className="max-w-[1280px] mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-neutral-400">
          <p>© {new Date().getFullYear()} HD Smoke Shop. All rights reserved.</p>
          <p className="text-center">These products are not intended to diagnose, treat, cure or prevent any disease. Keep out of reach of children.</p>
          {user?.role === "admin" && <Link to="/admin" data-testid="footer-admin-link" className="font-bold text-amber-300 hover:text-amber-200">Admin Panel</Link>}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
