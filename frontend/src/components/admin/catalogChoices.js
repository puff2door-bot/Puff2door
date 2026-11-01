export function resolveCategory(record, categories) {
  const rows = categories || [];
  const slug = String(record?.categorySlug || "").trim();
  const bySlug = rows.find((row) => row.slug === slug);
  if (bySlug) return { slug: bySlug.slug, name: bySlug.name, unmatched: false, legacy: "" };
  const text = String(record?.category || "").trim();
  if (!text) return { slug: "", name: "", unmatched: false, legacy: "" };
  const lowered = text.toLowerCase();
  const found = rows.find((row) => String(row.name || "").trim().toLowerCase() === lowered || String(row.slug || "").toLowerCase() === lowered);
  if (found) return { slug: found.slug, name: found.name, unmatched: false, legacy: "" };
  return { slug: "", name: "", unmatched: true, legacy: text };
}

export function resolveBrand(record, brands) {
  const rows = brands || [];
  const slug = String(record?.brandSlug || record?.brand || "").trim();
  const bySlug = rows.find((row) => row.slug === slug);
  if (bySlug) return { slug: bySlug.slug, name: bySlug.displayName || bySlug.name, unmatched: false, legacy: "" };
  const text = String(record?.brandName || "").trim();
  if (!text) return { slug: "", name: "", unmatched: false, legacy: "" };
  const lowered = text.toLowerCase();
  const found = rows.find((row) => String(row.displayName || row.name || "").trim().toLowerCase() === lowered || String(row.slug || "").toLowerCase() === lowered);
  if (found) return { slug: found.slug, name: found.displayName || found.name, unmatched: false, legacy: "" };
  return { slug: "", name: "", unmatched: true, legacy: text };
}
