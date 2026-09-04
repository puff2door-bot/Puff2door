import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "../api";
import { categories, brands } from "../mock";

const norm = (s) => (s || "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");

// Resolve a catalog brand (slug + display name, any casing/spacing) to the original logo entry in mock.js
export const findBrandAsset = (slug, brandName) => {
  const keys = [norm(slug), norm(brandName)].filter(Boolean);
  if (!keys.length) return null;
  const exact = brands.find((b) => keys.includes(norm(b.slug)) || keys.includes(norm(b.name)));
  if (exact) return exact;
  return brands.find((b) => {
    const bk = norm(b.slug);
    return bk.length >= 3 && keys.some((k) => k.length >= 3 && (k.startsWith(bk) || bk.startsWith(k)));
  }) || null;
};

const CatalogContext = createContext(null);

export const CatalogProvider = ({ children }) => {
  const [products, setProducts] = useState([]);
  const [home, setHome] = useState({ heroSlides: [], promoBlocks: [] });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([api.get("/products"), api.get("/content/home")]);
      setProducts(p.data.products || []);
      setHome({ heroSlides: c.data.heroSlides || [], promoBlocks: c.data.promoBlocks || [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const value = useMemo(() => {
    const inStock = products.filter((p) => p.categorySlug === "disposable" && p.inStock);
    const dayIndex = Math.floor(Date.now() / 86400000);
    const dealProduct = inStock.length ? inStock[dayIndex % inStock.length] : null;
    const deal = dealProduct
      ? { product: dealProduct, pct: 20, dealPrice: Math.round(dealProduct.price * 0.8 * 100) / 100, endsAt: new Date(new Date().setHours(24, 0, 0, 0)) }
      : null;
    const isOnDeal = (p) => Boolean(deal && p && p.id === deal.product.id);
    const getPrice = (p) => {
      if (!p) return 0;
      if (p.salePrice != null && p.salePrice > 0 && p.salePrice < p.price) return p.salePrice;
      return isOnDeal(p) ? deal.dealPrice : p.price;
    };
    const byId = (id) => products.find((p) => p.id === Number(id));
    const catCounts = {};
    const brandCounts = {};
    const brandNames = {};
    const catNames = {};
    products.forEach((p) => {
      if (p.categorySlug) { catCounts[p.categorySlug] = (catCounts[p.categorySlug] || 0) + 1; catNames[p.categorySlug] = p.category; }
      if (p.brand) { brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1; brandNames[p.brand] = p.brandName; }
    });
    const knownCats = categories.filter((c) => catCounts[c.slug]).map((c) => ({ ...c, count: catCounts[c.slug] }));
    const extraCats = Object.keys(catCounts).filter((s) => !categories.some((c) => c.slug === s)).sort().map((s) => ({ slug: s, name: (catNames[s] || s).toUpperCase(), count: catCounts[s] }));
    const activeCategories = products.length ? [...knownCats, ...extraCats] : categories;
    const activeBrands = products.length
      ? Object.keys(brandCounts).map((slug) => {
          const known = findBrandAsset(slug, brandNames[slug]);
          return { slug, name: (brandNames[slug] || known?.name || slug).toUpperCase(), image: known?.image || "", count: brandCounts[slug] };
        }).sort((a, b) => a.name.localeCompare(b.name))
      : brands;
    const promoTiles = home.promoBlocks.map((b) => {
      const pr = b.productId ? byId(b.productId) : null;
      return {
        id: b.id,
        tag: b.tag,
        label: b.label || pr?.name || "",
        image: b.image || pr?.image || "",
        link: b.link || (pr ? `/shop/${pr.slug}` : "/shop"),
        price: pr ? getPrice(pr) : null,
      };
    }).filter((t) => t.image);
    return {
      products,
      home,
      activeCategories,
      activeBrands,
      getCategory: (slug) => activeCategories.find((c) => c.slug === slug) || categories.find((c) => c.slug === slug) || null,
      getBrand: (slug) => activeBrands.find((b) => b.slug === slug) || brands.find((b) => b.slug === slug) || null,
      heroSlides: home.heroSlides,
      promoTiles,
      setHome,
      loading,
      refresh,
      getProductBySlug: (slug) => products.find((p) => p.slug === slug),
      getProductById: (id) => products.find((p) => p.id === Number(id)),
      getProductsByCategory: (slug) => products.filter((p) => p.categorySlug === slug),
      newProducts: products.slice(0, 18),
      dealOfTheDay: deal,
      isOnDeal,
      getPrice,
    };
  }, [products, home, loading, refresh]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
};

export const useCatalog = () => useContext(CatalogContext);
