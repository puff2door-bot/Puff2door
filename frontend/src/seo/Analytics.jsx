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

export const Analytics = () => {
  const { pathname, search } = useLocation();
  useEffect(() => { loadGa(); }, []);
  useEffect(() => {
    if (!GA_ID || !window.gtag) return;
    window.gtag("event", "page_view", { page_path: pathname + search, page_location: window.location.href, page_title: document.title });
  }, [pathname, search]);
  return null;
};

export default Analytics;
