import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const GA_ID = (process.env.REACT_APP_GA4_MEASUREMENT_ID || "").trim();

const loadGa = () => {
  if (!GA_ID || window.__p2dGaLoaded) return;
  window.__p2dGaLoaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { send_page_view: false });
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
};

export const trackEvent = (name, params = {}) => {
  if (!GA_ID || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
};

const gaItem = (p, qty = 1) => ({
  item_id: String(p.id),
  item_name: p.name,
  item_brand: p.brandName || p.brand || undefined,
  item_category: p.category || undefined,
  price: Number(p.unitPrice ?? (p.salePrice && p.salePrice > 0 && p.salePrice < p.price ? p.salePrice : p.price)) || 0,
  quantity: qty,
});

export const ecommerce = {
  viewItem: (p, price) => trackEvent("view_item", { currency: "USD", value: Number(price) || 0, items: [gaItem({ ...p, unitPrice: price })] }),
  addToCart: (p, qty, price) => trackEvent("add_to_cart", { currency: "USD", value: (Number(price) || 0) * qty, items: [gaItem({ ...p, unitPrice: price }, qty)] }),
  removeFromCart: (p, qty, price) => trackEvent("remove_from_cart", { currency: "USD", value: (Number(price) || 0) * qty, items: [gaItem({ ...p, unitPrice: price }, qty)] }),
  viewCart: (items, value) => trackEvent("view_cart", { currency: "USD", value, items: items.map((i) => gaItem({ ...i, unitPrice: i.unitPrice }, i.qty)) }),
  beginCheckout: (items, value, coupon) => trackEvent("begin_checkout", { currency: "USD", value, coupon: coupon || undefined, items: items.map((i) => gaItem({ ...i, unitPrice: i.unitPrice }, i.qty)) }),
  addPaymentInfo: (method, value) => trackEvent("add_payment_info", { currency: "USD", value, payment_type: method }),
  purchase: (order) => {
    const key = `p2d_ga_purchase_${order.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    trackEvent("purchase", {
      transaction_id: order.orderNumber || order.id,
      currency: "USD",
      value: Number(order.total) || 0,
      tax: Number(order.tax) || 0,
      shipping: Number(order.shippingCost) || 0,
      coupon: order.promoCode || undefined,
      payment_type: order.paymentMethod,
      items: (order.items || []).map((i) => ({ item_id: String(i.productId ?? i.id), item_name: i.name, price: Number(i.price) || 0, quantity: i.qty || 1 })),
    });
  },
};

export const Analytics = () => {
  const { pathname, search } = useLocation();
  useEffect(() => { loadGa(); }, []);
  useEffect(() => {
    const path = pathname + search;
    if (!GA_ID || !window.gtag) return undefined;
    const t = setTimeout(() => window.gtag("event", "page_view", { page_path: path, page_location: window.location.href, page_title: document.title }), 50);
    return () => clearTimeout(t);
  }, [pathname, search]);
  return null;
};

export default Analytics;
