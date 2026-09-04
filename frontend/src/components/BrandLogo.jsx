import React, { useState } from "react";

// Shows the brand logo when an asset exists and loads; otherwise falls back to the brand name
export const BrandLogo = ({ brand, showCount = false, textClass = "text-lg sm:text-xl" }) => {
  const [failed, setFailed] = useState(false);
  if (brand.image && !failed) {
    return <img src={brand.image} alt={`${brand.name} logo`} loading="lazy" onError={() => setFailed(true)} className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform" />;
  }
  return (
    <span data-testid={`brand-text-${brand.slug}`}>
      <span className={`block font-heading ${textClass} uppercase text-neutral-900 leading-tight group-hover:text-emerald-700 transition-colors`}>{brand.name}</span>
      {showCount && brand.count != null && <span className="block text-xs text-neutral-500 mt-1">{brand.count} product{brand.count === 1 ? "" : "s"}</span>}
    </span>
  );
};

export default BrandLogo;
