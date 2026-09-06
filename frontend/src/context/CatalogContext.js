import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "../api";

const CatalogContext = createContext(null);

export const CatalogProvider = ({ children }) => {
  const [products, setProducts] = useState([]);
  const [home, setHome] = useState({ heroSlides: [], promoBlocks: [] });
  const [loading, setLoading] = useState(true);
  const [brandRecords, setBrandRecords] = useState([]);
  const [categoryRecords, setCategoryRecords] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const [p, c, b, k] = await Promise.all([api.get("/products"), api.get("/content/home"), api.get("/brands").catch(() => ({ data: { brands: [] } })), api.get("/categories").catch(() => ({ data: { categories: [] } }))]);
      setCategoryRecords(k.data.categories || []);
      setProducts(p.data.products || []);
      setHome({ heroSlides: c.data.heroSlides || [], promoBlocks: c.data.promoBlocks || [] });
      setBrandRecords(b.data.brands || []);
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
    const knownCats = categoryRecords.filter((c) => catCounts[c.slug]).map((c) => ({ slug: c.slug, name: c.name, count: catCounts[c.slug] }));
    const extraCats = Object.keys(catCounts).filter((s) => !categoryRecords.some((c) => c.slug === s)).sort().map((s) => ({ slug: s, name: (catNames[s] || s).toUpperCase(), count: catCounts[s] }));
    const activeCategories = [...knownCats, ...extraCats];
    const brandRecord = (slug) => brandRecords.find((r) => r.slug === slug);
    const toBrand = (slug, count) => {
      const r = brandRecord(slug);
      return { id: r?.id || slug, slug, name: r?.displayName || (brandNames[slug] || slug).toUpperCase(), image: r?.logo || "", count };
    };
    const activeBrands = products.length
      ? Object.keys(brandCounts).map((slug) => toBrand(slug, brandCounts[slug])).sort((a, b) => a.name.localeCompare(b.name))
      : [];
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
      refresh,
      home,
      activeCategories,
      activeBrands,
      getCategory: (slug) => activeCategories.find((c) => c.slug === slug) || (categoryRecords.find((c) => c.slug === slug) ? { slug, name: categoryRecords.find((c) => c.slug === slug).name, count: 0 } : null),
      getBrand: (slug) => activeBrands.find((b) => b.slug === slug) || (brandRecord(slug) ? toBrand(slug, 0) : null),
      heroSlides: home.heroSlides,
      promoTiles,
      setHome,
      loading,
      refresh,
      brandRecords,
      setBrandRecords,
      categoryRecords,
      getProductBySlug: (slug) => products.find((p) => p.slug === slug),
      getProductById: (id) => products.find((p) => p.id === Number(id)),
      getProductsByCategory: (slug) => products.filter((p) => p.categorySlug === slug),
      newProducts: products.slice(0, 18),
      dealOfTheDay: deal,
      isOnDeal,
      getPrice,
    };
  }, [products, home, loading, refresh, brandRecords, categoryRecords]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
};

export const useCatalog = () => useContext(CatalogContext);
