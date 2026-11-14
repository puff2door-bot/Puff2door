import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import api, { getToken } from "../api";
import { ecommerce } from "../seo/Analytics";
import { calculateMixSave, DEFAULT_MIX_SAVE } from "../utils/mixSave";

const CartContext = createContext(null);

const MIX_SAVE_PREVIEW = process.env.REACT_APP_MIX_SAVE_PREVIEW === "1";
const PREVIEW_MIX_SAVE = {
  ...DEFAULT_MIX_SAVE,
  enabled: true,
  animationEnabled: true,
  animationStyle: "shimmer",
  eligibleCategorySlugs: ["disposable", "delta-smokeables", "delta", "delta-cartridges", "flower", "3-5g-flower"],
};

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
  mixSaveQty: Math.min(Number(i.mixSaveQty || 0), Number(i.qty || 0)),
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
  mixSaveQty: Math.min(Number(i.mixSaveQty || 0), Number(i.qty || 0)),
});

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState(readLocal);
  const [pricing, setPricing] = useState(DEFAULT_PRICING);
  const [delivery, setDelivery] = useState(DEFAULT_DELIVERY);
  const [loyalty, setLoyalty] = useState(DEFAULT_LOYALTY);
  const [presentation, setPresentation] = useState({ homepageLayout: "classic", liveShelfEnabled: false });
  const [mixSave, setMixSave] = useState(MIX_SAVE_PREVIEW ? PREVIEW_MIX_SAVE : DEFAULT_MIX_SAVE);
  const [serverQuote, setServerQuote] = useState(null);
  const [trust, setTrust] = useState({ googleReviewUrl: "" });
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [promo, setPromo] = useState(() => {
    try { return JSON.parse(localStorage.getItem("p2d_promo")) || null; } catch { return null; }
  });
  const settingsLoadFailed = useRef(false);

  const loadSettings = useCallback(() => {
    api.get("/settings").then(({ data }) => {
      setPricing(data.pricing);
      if (data.delivery) setDelivery(data.delivery);
      if (data.loyalty) setLoyalty(data.loyalty);
      if (data.presentation) setPresentation(data.presentation);
      if (data.mixSave && !MIX_SAVE_PREVIEW) setMixSave({ ...DEFAULT_MIX_SAVE, ...data.mixSave });
      if (data.trust) setTrust(data.trust);
      settingsLoadFailed.current = false;
    }).catch(() => { settingsLoadFailed.current = true; });
  }, []);

  useEffect(() => {
    loadSettings();
    const retryAfterWake = () => { if (settingsLoadFailed.current) loadSettings(); };
    window.addEventListener("p2d-backend-ready", retryAfterWake);
    return () => window.removeEventListener("p2d-backend-ready", retryAfterWake);
  }, [loadSettings]);

  useEffect(() => {
    const reset = () => setRedeemPoints(0);
    window.addEventListener("p2d-auth-change", reset);
    return () => window.removeEventListener("p2d-auth-change", reset);
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

  const addItem = (product, qty = 1, options = {}) => {
    ecommerce.addToCart(product, qty, product.price);
    try { window.dispatchEvent(new CustomEvent("p2d-cart-add")); } catch { /* old browsers */ }
    setItems((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      const bundleQty = options.mixSaveQty == null ? 0 : Math.min(Number(options.mixSaveQty || 0), qty);
      if (existing) return prev.map((i) => (i.id === product.id ? { ...i, qty: i.qty + qty, mixSaveQty: Number(i.mixSaveQty || 0) + bundleQty } : i));
      return [...prev, { ...product, qty, mixSaveQty: bundleQty }];
    });
  };
  const removeItem = (id) => {
    const it = items.find((i) => i.id === id);
    if (it) ecommerce.removeFromCart(it, it.qty, it.price);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };
  const updateQty = (id, qty) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, qty: Math.max(1, qty), mixSaveQty: Math.min(Number(i.mixSaveQty || 0), Math.max(1, qty)) } : i)));
  const clearCart = () => { setItems([]); setPromo(null); setRedeemPoints(0); };

  const count = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const localTotals = computeTotals(subtotal, pricing, promo, redeemPoints, loyalty, items, mixSave);
  const totals = serverQuote || localTotals;

  useEffect(() => {
    setServerQuote(null);
    const fallbackTotals = computeTotals(subtotal, pricing, promo, redeemPoints, loyalty, items, mixSave);
    const timer = setTimeout(() => {
      api.post("/cart/quote", { items: items.map(toServerItem), promoCode: promo?.code || "", redeemPoints, pickup: false })
        .then(({ data }) => setServerQuote({
          ...fallbackTotals,
          ...(data.totals || {}),
          shipping: data.totals?.shippingCost ?? fallbackTotals.shipping,
          reward: data.totals?.rewardDiscount ?? fallbackTotals.reward,
        }))
        .catch(() => setServerQuote(null));
    }, 250);
    return () => clearTimeout(timer);
  }, [items, subtotal, promo, redeemPoints, pricing, loyalty, mixSave]);

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQty, clearCart, count, subtotal, toServerItem, pricing, delivery, presentation, mixSave, trust, promo, applyPromo, removePromo, totals, loyalty, redeemPoints, setRedeemPoints }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const DEFAULT_PRICING = { taxRate: 0.065, taxLabel: "Sales tax (6.5%)", deliveryFee: 15, freeDeliveryMin: 99 };
export const DEFAULT_DELIVERY = { zip: "32714", radiusMiles: 20, allowedZipCodes: ["32714"], mode: "selected_zips", sameDayEnabled: null };
export const DEFAULT_LOYALTY = { enabled: true, pointsPerDollar: 1, pointsPerReward: 100, rewardValue: 5, minRedeemPoints: 100, maxRedeemPerOrder: 0, minPurchaseForRedeem: 0 };

export const promoDiscount = (promo, subtotal) => {
  if (!promo || subtotal < (promo.minSubtotal || 0)) return 0;
  const d = promo.type === "percent" ? subtotal * Math.min(promo.value, 100) / 100 : Math.min(promo.value, subtotal);
  return Math.round(d * 100) / 100;
};

export const rewardValue = (points, loyalty = DEFAULT_LOYALTY) => Math.round((points / loyalty.pointsPerReward) * loyalty.rewardValue * 100) / 100;

export const computeTotals = (subtotal, rules = DEFAULT_PRICING, promo = null, redeemPoints = 0, loyalty = DEFAULT_LOYALTY, items = [], mixSaveRules = DEFAULT_MIX_SAVE) => {
  const discount = promoDiscount(promo, subtotal);
  const mixSave = calculateMixSave(items, mixSaveRules, discount, subtotal);
  const bundleDiscount = mixSave.discount;
  const reward = Math.min(rewardValue(redeemPoints, loyalty), Math.round((subtotal - discount - bundleDiscount) * 100) / 100);
  const shipping = subtotal >= rules.freeDeliveryMin || subtotal === 0 ? 0 : rules.deliveryFee;
  const tax = Math.round((subtotal - discount - bundleDiscount - reward) * rules.taxRate * 100) / 100;
  const pointsToEarn = Math.floor(Math.max(subtotal - discount - bundleDiscount - reward, 0) * (loyalty.pointsPerDollar || 0));
  return { subtotal, discount, bundleDiscount, mixSave, reward, shipping, tax, pointsToEarn, total: Math.round((subtotal - discount - bundleDiscount - reward + shipping + tax) * 100) / 100 };
};

export const useCart = () => useContext(CartContext);
