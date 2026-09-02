import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import api, { getToken } from "../api";

const WishlistContext = createContext(null);

const readLocal = () => {
  try {
    const saved = localStorage.getItem("p2d_wishlist");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

const mergeLists = (server, local) => {
  const map = new Map();
  [...server, ...local].forEach((i) => {
    const prev = map.get(i.productId);
    map.set(i.productId, { ...i, notify: Boolean((prev && prev.notify) || i.notify) });
  });
  return Array.from(map.values());
};

export const WishlistProvider = ({ children }) => {
  const [items, setItems] = useState(readLocal);
  const syncTimer = useRef(null);
  const skipSync = useRef(false);

  useEffect(() => {
    localStorage.setItem("p2d_wishlist", JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    if (!getToken() || skipSync.current) {
      skipSync.current = false;
      return;
    }
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      api.put("/wishlist", { items }).catch(() => {});
    }, 600);
    return () => syncTimer.current && clearTimeout(syncTimer.current);
  }, [items]);

  useEffect(() => {
    const handleAuth = async () => {
      if (!getToken()) return;
      try {
        const { data } = await api.get("/wishlist");
        const merged = mergeLists(data.items || [], readLocal());
        await api.put("/wishlist", { items: merged });
        skipSync.current = true;
        setItems(merged);
      } catch {
        /* ignore */
      }
    };
    handleAuth();
    window.addEventListener("p2d-auth-change", handleAuth);
    return () => window.removeEventListener("p2d-auth-change", handleAuth);
  }, []);

  const has = (id) => items.some((i) => i.productId === id);
  const toggle = (product) => {
    setItems((prev) =>
      prev.some((i) => i.productId === product.id)
        ? prev.filter((i) => i.productId !== product.id)
        : [...prev, { productId: product.id, slug: product.slug, notify: false }]
    );
    return !has(product.id);
  };
  const remove = (id) => setItems((prev) => prev.filter((i) => i.productId !== id));
  const setNotify = (id, notify) =>
    setItems((prev) => prev.map((i) => (i.productId === id ? { ...i, notify } : i)));

  return (
    <WishlistContext.Provider value={{ items, has, toggle, remove, setNotify, count: items.length }}>
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => useContext(WishlistContext);
