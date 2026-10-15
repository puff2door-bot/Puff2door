const read = (key, fallback = []) => {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
};

export const rememberViewed = (product) => {
  if (!product) return;
  const item = { id: product.id, slug: product.slug, name: product.name, image: product.image, price: product.price, brandName: product.brandName, category: product.category, inStock: product.inStock };
  const next = [item, ...read("p2d_recently_viewed").filter((p) => p.id !== item.id)].slice(0, 12);
  localStorage.setItem("p2d_recently_viewed", JSON.stringify(next));
  window.dispatchEvent(new Event("p2d-experience-change"));
};

export const getRecentlyViewed = () => read("p2d_recently_viewed");

export const toggleCompare = (product) => {
  const current = read("p2d_compare");
  const exists = current.some((p) => p.id === product.id);
  const next = exists ? current.filter((p) => p.id !== product.id) : [...current, product].slice(-3);
  localStorage.setItem("p2d_compare", JSON.stringify(next));
  window.dispatchEvent(new Event("p2d-experience-change"));
  return !exists;
};

export const getCompare = () => read("p2d_compare");
