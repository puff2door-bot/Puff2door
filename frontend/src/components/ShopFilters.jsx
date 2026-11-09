import React from "react";
import { X } from "lucide-react";
import { PUFF_RANGES } from "../mock";

const COLLAPSED = 8;

const Group = ({ title, options, selected, onToggle, testPrefix }) => {
  const [expanded, setExpanded] = React.useState(false);
  if (options.length === 0) return null;
  // Show the biggest groups first when collapsed, but never hide one that is ticked.
  const byCount = [...options].sort((a, b) => b.count - a.count);
  const keep = new Set(byCount.slice(0, COLLAPSED).map((o) => o.key).concat(selected));
  const shown = expanded || options.length <= COLLAPSED ? options : options.filter((o) => keep.has(o.key));
  const hiddenCount = options.length - shown.length;
  return (
    <div className="mb-6">
      <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-neutral-500 mb-2">{title}</h4>
      <ul className="space-y-1.5 pr-1">
        {shown.map((o) => (
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
      {(hiddenCount > 0 || expanded) && options.length > COLLAPSED && (
        <button
          type="button"
          data-testid={`${testPrefix}-more`}
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-bold text-emerald-700 hover:underline"
        >
          {expanded ? "Show fewer" : `Show all ${options.length}`}
        </button>
      )}
    </div>
  );
};

const slugify = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");

// "500 mg" < "1 g" < "3.5 g": sort sizes by their weight in mg; ml and counts after.
const sizeRank = (label) => {
  const m = String(label).match(/([\d.]+)\s*(mg|g|ml|ct|pk)?/i);
  if (!m) return 1e12;
  const n = parseFloat(m[1]);
  const u = (m[2] || "").toLowerCase();
  return u === "mg" ? n : u === "g" ? n * 1000 : u === "ml" ? 1e9 + n : 1e10 + n;
};

export const buildFilterOptions = (list) => {
  const brandCounts = {};
  const flavorCounts = {};
  const puffCounts = {};
  const sizeCounts = {};
  list.forEach((p) => {
    if ((p.size || "").trim()) sizeCounts[p.size] = (sizeCounts[p.size] || 0) + 1;
    if ((p.brandName || "").trim()) brandCounts[p.brandName] = (brandCounts[p.brandName] || 0) + 1;
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
    sizes: Object.entries(sizeCounts).sort((a, b) => sizeRank(a[0]) - sizeRank(b[0])).map(([label, count]) => ({ key: slugify(label), label, count })),
    puffs: PUFF_RANGES.filter((r) => puffCounts[r.key]).map((r) => ({ key: r.key, label: r.label, count: puffCounts[r.key] })),
  };
};

export const applyFilters = (list, f) => {
  return list.filter((p) => {
    if (f.brands.length && !f.brands.includes(slugify(p.brandName))) return false;
    if (f.flavors.length && !p.flavors.some((fl) => f.flavors.includes(slugify(fl)))) return false;
    if ((f.sizes || []).length && !f.sizes.includes(slugify(p.size))) return false;
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
      [group]: (prev[group] || []).includes(key) ? prev[group].filter((k) => k !== key) : [...(prev[group] || []), key],
    }));
  const active = filters.brands.length + filters.flavors.length + filters.puffs.length + (filters.sizes || []).length;
  const tp = (k) => (variant === "mobile" ? `m-${k}` : k);

  return (
    <div data-testid={`shop-filters-${variant}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading text-lg uppercase tracking-wide">Filters</h3>
        {active > 0 && (
          <button
            data-testid={tp("clear-filters-btn")}
            onClick={() => setFilters({ brands: [], flavors: [], puffs: [], sizes: [] })}
            className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:underline"
          >
            <X className="h-3.5 w-3.5" /> Clear ({active})
          </button>
        )}
      </div>
      <Group title="Brand" options={options.brands} selected={filters.brands} onToggle={toggle("brands")} testPrefix={tp("filter-brand")} />
      <Group title="Flavor" options={options.flavors} selected={filters.flavors} onToggle={toggle("flavors")} testPrefix={tp("filter-flavor")} />
      <Group title="Puff Count" options={options.puffs} selected={filters.puffs} onToggle={toggle("puffs")} testPrefix={tp("filter-puffs")} />
      <Group title="Strength / Size" options={options.sizes || []} selected={filters.sizes || []} onToggle={toggle("sizes")} testPrefix={tp("filter-sizes")} />
    </div>
  );
};

export default ShopFilters;
