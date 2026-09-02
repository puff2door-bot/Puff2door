import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import api, { getToken } from "../api";

const CartContext = createContext(null);

const readLocal = () => {
  try {
    const saved = localStorage.getItem("p2d_cart");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

const toServerItem = (i) => ({
  productId: i.id,
  name: i.name,
  price: i.price,
  image: i.image,
  category: i.category || "",
  categorySlug: i.categorySlug || "",
  slug: i.slug || "",
  qty: i.qty,
});

const fromServerItem = (i) => ({
  id: i.productId,
  name: i.name,
  price: i.price,
  image: i.image,
  image2: i.image,
  category: i.category,
  categorySlug: i.categorySlug,
  slug: i.slug,
  qty: i.qty,
});

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState(readLocal);
  const [pricing, setPricing] = useState(DEFAULT_PRICING);
  const [promo, setPromo] = useState(() => {
    try { return JSON.parse(localStorage.getItem("p2d_promo")) || null; } catch { return null; }
  });

  useEffect(() => {
    api.get("/settings").then(({ data }) => setPricing(data.pricing)).catch(() => {});
  }, []);

  useEffect(() => {
    if (promo) localStorage.setItem("p2d_promo", JSON.stringify(promo));
    else localStorage.removeItem("p2d_promo");
  }, [promo]);

  const applyPromo = async (code) => {
    const { data } = await api.post("/promo/validate", { code, items: items.map(toServerItem) });
    setPromo(data);
    return data;
  };
  const removePromo = () => setPromo(null);
  const syncTimer = useRef(null);
  const skipSync = useRef(false);

  // Persist locally always
  useEffect(() => {
    localStorage.setItem("p2d_cart", JSON.stringify(items));
  }, [items]);

  // Push to server (debounced) when logged in
  useEffect(() => {
    if (!getToken() || skipSync.current) {
      skipSync.current = false;
      return;
    }
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      api.put("/cart", { items: items.map(toServerItem) }).catch(() => {});
    }, 600);
    return () => syncTimer.current && clearTimeout(syncTimer.current);
  }, [items]);

  // On auth change: merge local -> server or load server
  useEffect(() => {
    const handleAuth = async () => {
      if (!getToken()) return;
      try {
        const { data } = await api.get("/cart");
        const serverItems = (data.items || []).map(fromServerItem);
        const local = readLocal();
        if (serverItems.length === 0 && local.length > 0) {
          await api.put("/cart", { items: local.map(toServerItem) });
          skipSync.current = true;
          setItems(local);
        } else {
          skipSync.current = true;
          setItems(serverItems);
        }
      } catch {
        /* ignore */
      }
    };
    handleAuth();
    window.addEventListener("p2d-auth-change", handleAuth);
    return () => window.removeEventListener("p2d-auth-change", handleAuth);
  }, []);

  const addItem = (product, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) return prev.map((i) => (i.id === product.id ? { ...i, qty: i.qty + qty } : i));
      return [...prev, { ...product, qty }];
    });
  };
  const removeItem = (id) => setItems((prev) => prev.filter((i) => i.id !== id));
  const updateQty = (id, qty) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, qty: Math.max(1, qty) } : i)));
  const clearCart = () => { setItems([]); setPromo(null); };

  const count = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const totals = computeTotals(subtotal, pricing, promo);

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQty, clearCart, count, subtotal, toServerItem, pricing, promo, applyPromo, removePromo, totals }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const DEFAULT_PRICING = { taxRate: 0.065, taxLabel: "Sales tax (6.5%)", deliveryFee: 15, freeDeliveryMin: 75 };

export const promoDiscount = (promo, subtotal) => {
  if (!promo || subtotal < (promo.minSubtotal || 0)) return 0;
  const d = promo.type === "percent" ? subtotal * Math.min(promo.value, 100) / 100 : Math.min(promo.value, subtotal);
  return Math.round(d * 100) / 100;
};

export const computeTotals = (subtotal, rules = DEFAULT_PRICING, promo = null) => {
  const discount = promoDiscount(promo, subtotal);
  const shipping = subtotal >= rules.freeDeliveryMin || subtotal === 0 ? 0 : rules.deliveryFee;
  const tax = Math.round((subtotal - discount) * rules.taxRate * 100) / 100;
  return { subtotal, discount, shipping, tax, total: Math.round((subtotal - discount + shipping + tax) * 100) / 100 };
};

export const useCart = () => useContext(CartContext);
