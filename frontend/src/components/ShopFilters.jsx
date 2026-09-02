import React from "react";
import { X } from "lucide-react";
import { PUFF_RANGES } from "../mock";

const Group = ({ title, options, selected, onToggle, testPrefix }) => {
  if (options.length === 0) return null;
  return (
    <div className="mb-6">
      <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-neutral-500 mb-2">{title}</h4>
      <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
        {options.map((o) => (
          <li key={o.key}>
            <label className="flex items-center gap-2.5 text-sm text-neutral-700 cursor-pointer hover:text-emerald-700">
              <input
                type="checkbox"
                data-testid={`${testPrefix}-${o.key}`}
                checked={selected.includes(o.key)}
                onChange={() => onToggle(o.key)}
                className="accent-emerald-600 h-4 w-4"
              />
              <span className="flex-1">{o.label}</span>
              <span className="text-xs text-neutral-400">{o.count}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
};

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export const buildFilterOptions = (list) => {
  const brandCounts = {};
  const flavorCounts = {};
  const puffCounts = {};
  list.forEach((p) => {
    brandCounts[p.brandName] = (brandCounts[p.brandName] || 0) + 1;
    p.flavors.forEach((f) => { flavorCounts[f] = (flavorCounts[f] || 0) + 1; });
    if (p.puffs) {
      const r = PUFF_RANGES.find((x) => p.puffs >= x.min && p.puffs <= x.max);
      if (r) puffCounts[r.key] = (puffCounts[r.key] || 0) + 1;
    }
  });
  const toOpts = (counts) =>
    Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0])).map(([label, count]) => ({ key: slugify(label), label, count }));
  return {
    brands: toOpts(brandCounts),
    flavors: toOpts(flavorCounts),
    puffs: PUFF_RANGES.filter((r) => puffCounts[r.key]).map((r) => ({ key: r.key, label: r.label, count: puffCounts[r.key] })),
  };
};

export const applyFilters = (list, f) => {
  return list.filter((p) => {
    if (f.brands.length && !f.brands.includes(slugify(p.brandName))) return false;
    if (f.flavors.length && !p.flavors.some((fl) => f.flavors.includes(slugify(fl)))) return false;
    if (f.puffs.length) {
      if (!p.puffs) return false;
      const r = PUFF_RANGES.find((x) => p.puffs >= x.min && p.puffs <= x.max);
      if (!r || !f.puffs.includes(r.key)) return false;
    }
    return true;
  });
};

const ShopFilters = ({ options, filters, setFilters, variant = "desktop" }) => {
  const toggle = (group) => (key) =>
    setFilters((prev) => ({
      ...prev,
      [group]: prev[group].includes(key) ? prev[group].filter((k) => k !== key) : [...prev[group], key],
    }));
  const active = filters.brands.length + filters.flavors.length + filters.puffs.length;
  const tp = (k) => (variant === "mobile" ? `m-${k}` : k);

  return (
    <div data-testid={`shop-filters-${variant}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading text-lg uppercase tracking-wide">Filters</h3>
        {active > 0 && (
          <button
            data-testid={tp("clear-filters-btn")}
            onClick={() => setFilters({ brands: [], flavors: [], puffs: [] })}
            className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:underline"
          >
            <X className="h-3.5 w-3.5" /> Clear ({active})
          </button>
        )}
      </div>
      <Group title="Brand" options={options.brands} selected={filters.brands} onToggle={toggle("brands")} testPrefix={tp("filter-brand")} />
      <Group title="Flavor" options={options.flavors} selected={filters.flavors} onToggle={toggle("flavors")} testPrefix={tp("filter-flavor")} />
      <Group title="Puff Count" options={options.puffs} selected={filters.puffs} onToggle={toggle("puffs")} testPrefix={tp("filter-puffs")} />
    </div>
  );
};

export default ShopFilters;
