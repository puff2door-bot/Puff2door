const loaded = {};

export const loadScript = (src, attrs = {}) => {
  if (loaded[src]) return loaded[src];
  loaded[src] = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
    s.onload = () => resolve();
    s.onerror = () => { delete loaded[src]; reject(new Error(`Failed to load ${src}`)); };
    document.head.appendChild(s);
  });
  return loaded[src];
};
