import React from "react";
import { Link } from "react-router-dom";
import { Leaf, Phone, Mail, MapPin, Facebook, Instagram, Twitter } from "lucide-react";
import { categories, BRAND } from "../mock";

const Footer = () => {
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

      <div className="max-w-[1280px] mx-auto px-4 py-14 grid grid-cols-1 md:grid-cols-4 gap-10">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="grid place-items-center h-9 w-9 rounded-full bg-emerald-600">
              <Leaf className="h-5 w-5 text-white" />
            </span>
            <span className="font-heading font-700 text-xl text-white">
              Puff<span className="text-emerald-500">2</span>Door
            </span>
          </div>
          <p className="text-sm leading-relaxed text-neutral-400">
            Your one-stop shop for disposable vapes, delta, kratom, glass, papers and
            accessories — delivered fast and discreet, right to your door.
          </p>
          <div className="flex gap-3 mt-5">
            {[Facebook, Instagram, Twitter].map((Icon, i) => (
              <a key={i} href="#" className="grid place-items-center h-9 w-9 rounded-full bg-neutral-800 hover:bg-emerald-600 transition-colors">
                <Icon className="h-4 w-4 text-white" />
              </a>
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-heading text-white text-base tracking-wide mb-4 uppercase">Shop</h4>
          <ul className="space-y-2.5 text-sm">
            {categories.slice(0, 7).map((c) => (
              <li key={c.slug}>
                <Link to={`/product-category/${c.slug}`} className="hover:text-emerald-400 transition-colors">{c.name}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="font-heading text-white text-base tracking-wide mb-4 uppercase">Company</h4>
          <ul className="space-y-2.5 text-sm">
            <li><Link to="/about" className="hover:text-emerald-400 transition-colors">About Us</Link></li>
            <li><Link to="/contact" className="hover:text-emerald-400 transition-colors">Contact</Link></li>
            <li><Link to="/track" className="hover:text-emerald-400 transition-colors">Track Order</Link></li>
            <li><Link to="/brands" className="hover:text-emerald-400 transition-colors">Brands</Link></li>
            <li><Link to="/my-account" className="hover:text-emerald-400 transition-colors">My Account</Link></li>
            <li><Link to="/cart" className="hover:text-emerald-400 transition-colors">Cart</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="font-heading text-white text-base tracking-wide mb-4 uppercase">Get In Touch</h4>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-3"><Phone className="h-4 w-4 text-emerald-500 mt-0.5" /> {BRAND.phone}</li>
            <li className="flex items-start gap-3"><Mail className="h-4 w-4 text-emerald-500 mt-0.5" /> {BRAND.email}</li>
            <li className="flex items-start gap-3"><MapPin className="h-4 w-4 text-emerald-500 mt-0.5" /> {BRAND.address}</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-neutral-800">
        <div className="max-w-[1280px] mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-neutral-500">
          <p>© {new Date().getFullYear()} Puff2Door. All rights reserved.</p>
          <p className="text-center">These products are not intended to diagnose, treat, cure or prevent any disease. Keep out of reach of children.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
