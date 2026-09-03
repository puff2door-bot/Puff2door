import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { absUrl, DEFAULT_DESCRIPTION, DEFAULT_IMAGE, DEFAULT_TITLE, SITE_NAME } from "./config";

const upsert = (selector, create, attrs) => {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
};

const setMeta = (key, value, attr = "name") => upsert(`meta[${attr}="${key}"]`, () => { const m = document.createElement("meta"); m.setAttribute(attr, key); return m; }, { content: value });

export const setJsonLd = (group, blocks) => {
  document.head.querySelectorAll(`script[data-seo-ld="${group}"]`).forEach((s) => s.remove());
  blocks.forEach((b) => {
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.dataset.seoLd = group;
    s.text = JSON.stringify(b);
    document.head.appendChild(s);
  });
};

export const Seo = ({ title, description, path, image, type = "website", noindex = false, jsonLd }) => {
  const location = useLocation();
  const canonical = absUrl(path ?? location.pathname);
  const fullTitle = title || DEFAULT_TITLE;
  const desc = description || DEFAULT_DESCRIPTION;
  const img = image ? absUrl(image) : DEFAULT_IMAGE;
  const ld = JSON.stringify(jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : []);

  useEffect(() => {
    document.title = fullTitle;
    setMeta("description", desc);
    setMeta("robots", noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large");
    upsert('link[rel="canonical"]', () => { const l = document.createElement("link"); l.rel = "canonical"; return l; }, { href: canonical });
    setMeta("og:type", type, "property");
    setMeta("og:site_name", SITE_NAME, "property");
    setMeta("og:title", fullTitle, "property");
    setMeta("og:description", desc, "property");
    setMeta("og:url", canonical, "property");
    setMeta("og:image", img, "property");
    setMeta("og:locale", "en_US", "property");
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", fullTitle);
    setMeta("twitter:description", desc);
    setMeta("twitter:image", img);
    setJsonLd("page", JSON.parse(ld));
  }, [fullTitle, desc, canonical, img, type, noindex, ld]);

  return null;
};

export default Seo;
