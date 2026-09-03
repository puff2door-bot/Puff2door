import React from "react";
import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import Seo from "../seo/Seo";

const NotFound = () => (
  <div className="max-w-[1280px] mx-auto px-4 py-24 text-center" data-testid="not-found-page">
    <Seo noindex title="Page not found | Puff2door" description="The page you followed doesn't exist or has moved." />
    <Compass className="h-12 w-12 text-emerald-600 mx-auto mb-4" />
    <p className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-400 mb-2">404</p>
    <h1 className="font-heading text-4xl sm:text-5xl mb-3">This page went up in smoke</h1>
    <p className="text-neutral-500 mb-8">The link you followed doesn't exist or has moved.</p>
    <div className="flex justify-center gap-3">
      <Link to="/" className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors">Back Home</Link>
      <Link to="/shop" className="px-6 py-3 border-2 border-neutral-900 text-neutral-900 font-bold rounded-full hover:bg-neutral-900 hover:text-white transition-colors">Browse Shop</Link>
    </div>
  </div>
);

export default NotFound;
