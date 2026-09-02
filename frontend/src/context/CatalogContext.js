import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "../api";

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
