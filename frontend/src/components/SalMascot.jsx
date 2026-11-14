import React, { useEffect, useId, useRef, useState } from "react";
import { useCart } from "../context/CartContext";

// Sal from Puff2door, the delivery mascot. The drawings are inline SVG (about 2 KB each), so they add
// no extra download and can't shift the layout: every Sal has a fixed size.
// Turn him off, or edit his lines, in Admin > Store Settings.
const POSES = {
 "wave": "<g transform=\"translate(140 125)\"><path d=\"M-95 170 Q-90 72 0 68 Q90 72 95 170 Z\" fill=\"#047857\"/>\n<g fill=\"#ffffff\" opacity=\"0.85\"><ellipse cx=\"-58\" cy=\"122\" rx=\"13\" ry=\"6\" transform=\"rotate(-30 -58 122)\"/><ellipse cx=\"55\" cy=\"112\" rx=\"13\" ry=\"6\" transform=\"rotate(25 55 112)\"/><ellipse cx=\"-30\" cy=\"155\" rx=\"11\" ry=\"5\"/><ellipse cx=\"68\" cy=\"152\" rx=\"11\" ry=\"5\" transform=\"rotate(-20 68 152)\"/><circle cx=\"-70\" cy=\"150\" r=\"4\"/><circle cx=\"40\" cy=\"140\" r=\"4\"/></g>\n<path d=\"M-22 70 L0 104 L22 70\" fill=\"none\" stroke=\"#ffffff\" stroke-width=\"6\" stroke-linejoin=\"round\"/>\n<path d=\"M70 88 Q110 60 118 10\" stroke=\"#047857\" stroke-width=\"30\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M116 22 L122 -18\" stroke=\"#e0a878\" stroke-width=\"22\" stroke-linecap=\"round\"/><circle cx=\"123\" cy=\"-28\" r=\"17\" fill=\"#e0a878\"/>\n<path d=\"M100 -60 q10 -8 20 -2 M132 -62 q8 -4 16 4\" stroke=\"#047857\" stroke-width=\"4\" fill=\"none\" stroke-linecap=\"round\"/>\n<line x1=\"-75\" y1=\"80\" x2=\"60\" y2=\"165\" stroke=\"#111111\" stroke-width=\"12\"/><circle cx=\"-60\" cy=\"6\" r=\"12\" fill=\"#e0a878\"/><circle cx=\"60\" cy=\"6\" r=\"12\" fill=\"#e0a878\"/>\n<circle cx=\"0\" cy=\"0\" r=\"60\" fill=\"#e0a878\"/>\n<path d=\"M-60 -8 q-6 22 2 40\" stroke=\"#9ca3af\" stroke-width=\"11\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M60 -8 q6 22 -2 40\" stroke=\"#9ca3af\" stroke-width=\"11\" fill=\"none\" stroke-linecap=\"round\"/>\n<path d=\"M-62 -16 Q-60 -72 0 -74 Q60 -72 62 -16 Z\" fill=\"#111111\"/><rect x=\"-92\" y=\"-30\" width=\"46\" height=\"13\" rx=\"6\" fill=\"#047857\"/><circle cx=\"0\" cy=\"-72\" r=\"6\" fill=\"#047857\"/><text x=\"18\" y=\"-38\" font-family=\"Oswald, sans-serif\" font-size=\"16\" font-weight=\"700\" fill=\"#10b981\" text-anchor=\"middle\">HD</text>\n<rect x=\"-44\" y=\"-12\" width=\"38\" height=\"22\" rx=\"7\" fill=\"#111111\"/><rect x=\"6\" y=\"-12\" width=\"38\" height=\"22\" rx=\"7\" fill=\"#111111\"/><rect x=\"-8\" y=\"-6\" width=\"16\" height=\"5\" fill=\"#111111\"/>\n<path d=\"M-42 28 Q0 4 42 28 Q24 44 0 33 Q-24 44 -42 28 Z\" fill=\"#111111\"/>\n<path d=\"M-12 44 q12 7 24 0\" stroke=\"#111111\" stroke-width=\"4\" fill=\"none\" stroke-linecap=\"round\"/></g>",
 "bag": "<g transform=\"translate(150 118)\"><path d=\"M-95 170 Q-90 72 0 68 Q90 72 95 170 Z\" fill=\"#047857\"/>\n<g fill=\"#ffffff\" opacity=\"0.85\"><ellipse cx=\"-58\" cy=\"122\" rx=\"13\" ry=\"6\" transform=\"rotate(-30 -58 122)\"/><ellipse cx=\"55\" cy=\"112\" rx=\"13\" ry=\"6\" transform=\"rotate(25 55 112)\"/><ellipse cx=\"-30\" cy=\"155\" rx=\"11\" ry=\"5\"/><ellipse cx=\"68\" cy=\"152\" rx=\"11\" ry=\"5\" transform=\"rotate(-20 68 152)\"/><circle cx=\"-70\" cy=\"150\" r=\"4\"/><circle cx=\"40\" cy=\"140\" r=\"4\"/></g>\n<path d=\"M-22 70 L0 104 L22 70\" fill=\"none\" stroke=\"#ffffff\" stroke-width=\"6\" stroke-linejoin=\"round\"/><circle cx=\"-60\" cy=\"6\" r=\"12\" fill=\"#e0a878\"/><circle cx=\"60\" cy=\"6\" r=\"12\" fill=\"#e0a878\"/>\n<circle cx=\"0\" cy=\"0\" r=\"60\" fill=\"#e0a878\"/>\n<path d=\"M-60 -8 q-6 22 2 40\" stroke=\"#9ca3af\" stroke-width=\"11\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M60 -8 q6 22 -2 40\" stroke=\"#9ca3af\" stroke-width=\"11\" fill=\"none\" stroke-linecap=\"round\"/>\n<path d=\"M-62 -16 Q-60 -72 0 -74 Q60 -72 62 -16 Z\" fill=\"#111111\"/><rect x=\"-92\" y=\"-30\" width=\"46\" height=\"13\" rx=\"6\" fill=\"#047857\"/><circle cx=\"0\" cy=\"-72\" r=\"6\" fill=\"#047857\"/><text x=\"18\" y=\"-38\" font-family=\"Oswald, sans-serif\" font-size=\"16\" font-weight=\"700\" fill=\"#10b981\" text-anchor=\"middle\">HD</text>\n<rect x=\"-44\" y=\"-12\" width=\"38\" height=\"22\" rx=\"7\" fill=\"#111111\"/><rect x=\"6\" y=\"-12\" width=\"38\" height=\"22\" rx=\"7\" fill=\"#111111\"/><rect x=\"-8\" y=\"-6\" width=\"16\" height=\"5\" fill=\"#111111\"/>\n<path d=\"M-42 28 Q0 4 42 28 Q24 44 0 33 Q-24 44 -42 28 Z\" fill=\"#111111\"/>\n<path d=\"M-12 44 q12 7 24 0\" stroke=\"#111111\" stroke-width=\"4\" fill=\"none\" stroke-linecap=\"round\"/>\n<path d=\"M-50 110 L50 110 L58 182 L-58 182 Z\" fill=\"#ffffff\" stroke=\"#111111\" stroke-width=\"5\"/><path d=\"M-22 110 q22 -26 44 0\" stroke=\"#111111\" stroke-width=\"5\" fill=\"none\"/>\n<circle cx=\"0\" cy=\"146\" r=\"20\" fill=\"#047857\"/><text x=\"0\" y=\"152\" font-family=\"Oswald, sans-serif\" font-size=\"16\" font-weight=\"700\" fill=\"#ffffff\" text-anchor=\"middle\">HD</text>\n<circle cx=\"-56\" cy=\"128\" r=\"14\" fill=\"#e0a878\"/><circle cx=\"56\" cy=\"128\" r=\"14\" fill=\"#e0a878\"/></g>",
 "drive": "<g fill=\"none\" stroke=\"#047857\" stroke-width=\"6\" stroke-linecap=\"round\"><line x1=\"8\" y1=\"170\" x2=\"40\" y2=\"170\"/><line x1=\"2\" y1=\"196\" x2=\"34\" y2=\"196\"/><line x1=\"12\" y1=\"222\" x2=\"40\" y2=\"222\"/></g>\n<path d=\"M44 236 L44 176 Q48 152 74 148 L110 112 Q120 104 136 104 L222 104 Q238 104 248 116 L272 150 Q296 154 296 178 L296 236 Z\" fill=\"#047857\"/>\n<path d=\"M120 116 L216 116 Q228 116 236 128 L254 150 L104 150 Z\" fill=\"#d1fae5\"/>\n<g transform=\"translate(176 118) scale(0.5)\"><circle cx=\"-60\" cy=\"6\" r=\"12\" fill=\"#e0a878\"/><circle cx=\"60\" cy=\"6\" r=\"12\" fill=\"#e0a878\"/>\n<circle cx=\"0\" cy=\"0\" r=\"60\" fill=\"#e0a878\"/>\n<path d=\"M-60 -8 q-6 22 2 40\" stroke=\"#9ca3af\" stroke-width=\"11\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M60 -8 q6 22 -2 40\" stroke=\"#9ca3af\" stroke-width=\"11\" fill=\"none\" stroke-linecap=\"round\"/>\n<path d=\"M-62 -16 Q-60 -72 0 -74 Q60 -72 62 -16 Z\" fill=\"#111111\"/><rect x=\"-92\" y=\"-30\" width=\"46\" height=\"13\" rx=\"6\" fill=\"#047857\"/><circle cx=\"0\" cy=\"-72\" r=\"6\" fill=\"#047857\"/><text x=\"18\" y=\"-38\" font-family=\"Oswald, sans-serif\" font-size=\"16\" font-weight=\"700\" fill=\"#10b981\" text-anchor=\"middle\">HD</text>\n<rect x=\"-44\" y=\"-12\" width=\"38\" height=\"22\" rx=\"7\" fill=\"#111111\"/><rect x=\"6\" y=\"-12\" width=\"38\" height=\"22\" rx=\"7\" fill=\"#111111\"/><rect x=\"-8\" y=\"-6\" width=\"16\" height=\"5\" fill=\"#111111\"/>\n<path d=\"M-42 28 Q0 4 42 28 Q24 44 0 33 Q-24 44 -42 28 Z\" fill=\"#111111\"/>\n<path d=\"M-12 44 q12 7 24 0\" stroke=\"#111111\" stroke-width=\"4\" fill=\"none\" stroke-linecap=\"round\"/></g>\n<path d=\"M150 150 Q170 136 196 146\" stroke=\"#e0a878\" stroke-width=\"14\" stroke-linecap=\"round\" fill=\"none\"/>\n<text x=\"176\" y=\"196\" font-family=\"Oswald, sans-serif\" font-size=\"20\" font-weight=\"700\" fill=\"#ffffff\" text-anchor=\"middle\" letter-spacing=\"2\">PUFF2DOOR</text>\n<circle cx=\"96\" cy=\"240\" r=\"28\" fill=\"#111111\"/><circle cx=\"96\" cy=\"240\" r=\"11\" fill=\"#d4d4d4\"/><circle cx=\"246\" cy=\"240\" r=\"28\" fill=\"#111111\"/><circle cx=\"246\" cy=\"240\" r=\"11\" fill=\"#d4d4d4\"/>\n<rect x=\"286\" y=\"168\" width=\"10\" height=\"16\" rx=\"3\" fill=\"#fef3c7\"/>",
 "avatar": "<circle cx=\"150\" cy=\"150\" r=\"140\" fill=\"#047857\"/><clipPath id=\"av\"><circle cx=\"150\" cy=\"150\" r=\"140\"/></clipPath><g clip-path=\"url(#av)\"><g transform=\"translate(150 150) scale(1.05)\"><path d=\"M-95 170 Q-90 72 0 68 Q90 72 95 170 Z\" fill=\"#047857\"/>\n<g fill=\"#ffffff\" opacity=\"0.85\"><ellipse cx=\"-58\" cy=\"122\" rx=\"13\" ry=\"6\" transform=\"rotate(-30 -58 122)\"/><ellipse cx=\"55\" cy=\"112\" rx=\"13\" ry=\"6\" transform=\"rotate(25 55 112)\"/><ellipse cx=\"-30\" cy=\"155\" rx=\"11\" ry=\"5\"/><ellipse cx=\"68\" cy=\"152\" rx=\"11\" ry=\"5\" transform=\"rotate(-20 68 152)\"/><circle cx=\"-70\" cy=\"150\" r=\"4\"/><circle cx=\"40\" cy=\"140\" r=\"4\"/></g>\n<path d=\"M-22 70 L0 104 L22 70\" fill=\"none\" stroke=\"#ffffff\" stroke-width=\"6\" stroke-linejoin=\"round\"/><circle cx=\"-60\" cy=\"6\" r=\"12\" fill=\"#e0a878\"/><circle cx=\"60\" cy=\"6\" r=\"12\" fill=\"#e0a878\"/>\n<circle cx=\"0\" cy=\"0\" r=\"60\" fill=\"#e0a878\"/>\n<path d=\"M-60 -8 q-6 22 2 40\" stroke=\"#9ca3af\" stroke-width=\"11\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M60 -8 q6 22 -2 40\" stroke=\"#9ca3af\" stroke-width=\"11\" fill=\"none\" stroke-linecap=\"round\"/>\n<path d=\"M-62 -16 Q-60 -72 0 -74 Q60 -72 62 -16 Z\" fill=\"#111111\"/><rect x=\"-92\" y=\"-30\" width=\"46\" height=\"13\" rx=\"6\" fill=\"#047857\"/><circle cx=\"0\" cy=\"-72\" r=\"6\" fill=\"#047857\"/><text x=\"18\" y=\"-38\" font-family=\"Oswald, sans-serif\" font-size=\"16\" font-weight=\"700\" fill=\"#10b981\" text-anchor=\"middle\">HD</text>\n<rect x=\"-44\" y=\"-12\" width=\"38\" height=\"22\" rx=\"7\" fill=\"#111111\"/><rect x=\"6\" y=\"-12\" width=\"38\" height=\"22\" rx=\"7\" fill=\"#111111\"/><rect x=\"-8\" y=\"-6\" width=\"16\" height=\"5\" fill=\"#111111\"/>\n<path d=\"M-42 28 Q0 4 42 28 Q24 44 0 33 Q-24 44 -42 28 Z\" fill=\"#111111\"/>\n<path d=\"M-12 44 q12 7 24 0\" stroke=\"#111111\" stroke-width=\"4\" fill=\"none\" stroke-linecap=\"round\"/></g></g>",
 "face": "<g transform=\"translate(150 168) scale(1.85)\"><circle cx=\"-60\" cy=\"6\" r=\"12\" fill=\"#e0a878\"/><circle cx=\"60\" cy=\"6\" r=\"12\" fill=\"#e0a878\"/>\n<circle cx=\"0\" cy=\"0\" r=\"60\" fill=\"#e0a878\"/>\n<path d=\"M-60 -8 q-6 22 2 40\" stroke=\"#9ca3af\" stroke-width=\"11\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M60 -8 q6 22 -2 40\" stroke=\"#9ca3af\" stroke-width=\"11\" fill=\"none\" stroke-linecap=\"round\"/>\n<path d=\"M-62 -16 Q-60 -72 0 -74 Q60 -72 62 -16 Z\" fill=\"#111111\"/><rect x=\"-92\" y=\"-30\" width=\"46\" height=\"13\" rx=\"6\" fill=\"#047857\"/><circle cx=\"0\" cy=\"-72\" r=\"6\" fill=\"#047857\"/><text x=\"18\" y=\"-38\" font-family=\"Oswald, sans-serif\" font-size=\"16\" font-weight=\"700\" fill=\"#10b981\" text-anchor=\"middle\">HD</text>\n<rect x=\"-44\" y=\"-12\" width=\"38\" height=\"22\" rx=\"7\" fill=\"#111111\"/><rect x=\"6\" y=\"-12\" width=\"38\" height=\"22\" rx=\"7\" fill=\"#111111\"/><rect x=\"-8\" y=\"-6\" width=\"16\" height=\"5\" fill=\"#111111\"/>\n<path d=\"M-42 28 Q0 4 42 28 Q24 44 0 33 Q-24 44 -42 28 Z\" fill=\"#111111\"/>\n<path d=\"M-12 44 q12 7 24 0\" stroke=\"#111111\" stroke-width=\"4\" fill=\"none\" stroke-linecap=\"round\"/></g>"
};

// ---- Looks: outfits, night cap, eyes behind the shades (for the wink) ----------------------------
// Every pose uses the same head, so outfits and the wink work by swapping the cap and shades in place.
const CAP = '<path d="M-62 -16 Q-60 -72 0 -74 Q60 -72 62 -16 Z" fill="#111111"/><rect x="-92" y="-30" width="46" height="13" rx="6" fill="#047857"/><circle cx="0" cy="-72" r="6" fill="#047857"/><text x="18" y="-38" font-family="Oswald, sans-serif" font-size="16" font-weight="700" fill="#10b981" text-anchor="middle">HD</text>';
const SHADES = '<rect x="-44" y="-12" width="38" height="22" rx="7" fill="#111111"/><rect x="6" y="-12" width="38" height="22" rx="7" fill="#111111"/><rect x="-8" y="-6" width="16" height="5" fill="#111111"/>';
const EYES = '<ellipse cx="-25" cy="-1" rx="11" ry="9" fill="#fff"/><circle cx="-25" cy="0" r="5" fill="#111111"/><ellipse cx="25" cy="-1" rx="11" ry="9" fill="#fff"/><circle cx="25" cy="0" r="5" fill="#111111"/><g class="sal-lid"><rect x="13" y="-11" width="24" height="20" rx="9" fill="#e0a878"/><path d="M14 0 q11 7 22 0" stroke="#111111" stroke-width="4" fill="none"/></g>';
const AWAKE = EYES + '<g class="sal-shades">' + SHADES + '<path class="sal-glint" d="M-38 6 L-28 -10 M-30 6 L-22 -8" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/></g>';
const ASLEEP = '<path d="M-36 0 q11 7 22 0 M14 0 q11 7 22 0" stroke="#111111" stroke-width="4" fill="none" stroke-linecap="round"/><text class="sal-z" x="56" y="-34" font-family="Oswald, sans-serif" font-size="18" font-weight="700" fill="#0369a1">z</text><text class="sal-z sal-z2" x="66" y="-52" font-family="Oswald, sans-serif" font-size="22" font-weight="700" fill="#0369a1">Z</text>';
const HATS = {
  santa: '<path d="M-64 -20 Q-54 -84 6 -84 Q54 -80 62 -44 L76 -18 Z" fill="#dc2626"/><circle cx="76" cy="-14" r="11" fill="#ffffff"/><rect x="-68" y="-32" width="134" height="18" rx="9" fill="#ffffff"/>',
  witch: '<ellipse cx="0" cy="-34" rx="78" ry="12" fill="#1f1235"/><path d="M-42 -38 Q-10 -70 12 -88 Q14 -66 42 -38 Z" fill="#1f1235"/><rect x="-40" y="-50" width="82" height="11" fill="#f97316"/>',
  usa: '<path d="M-62 -16 Q-60 -72 0 -74 Q60 -72 62 -16 Z" fill="#1d4ed8"/><path d="M-58 -32 H58 M-50 -52 H50" stroke="#ffffff" stroke-width="7"/><path d="M-56 -42 H56" stroke="#dc2626" stroke-width="7"/><rect x="-92" y="-30" width="46" height="13" rx="6" fill="#dc2626"/><text x="0" y="-56" font-size="20" fill="#ffffff" text-anchor="middle">★</text>',
  party: '<path d="M-62 -16 Q-60 -72 0 -74 Q60 -72 62 -16 Z" fill="#111111"/><rect x="-92" y="-30" width="46" height="13" rx="6" fill="#047857"/><path d="M-6 -70 L14 -88 L30 -66 Z" fill="#a855f7"/><circle cx="14" cy="-88" r="5" fill="#facc15"/>',
  night: '<path d="M-64 -14 Q-60 -78 0 -80 Q56 -78 70 -46 Q78 -30 76 -16 Q66 -34 50 -36 Z" fill="#1e3a8a"/><circle cx="76" cy="-12" r="10" fill="#ffffff"/><rect x="-68" y="-28" width="130" height="15" rx="7" fill="#ffffff"/>',
};

const easternNow = () => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", hour: "numeric", hour12: false }).formatToParts(new Date());
  const get = (t) => Number((parts.find((p) => p.type === t) || {}).value || 0);
  return { m: get("month"), d: get("day"), h: get("hour") % 24 };
};

// "auto" dresses Sal for the season: Halloween (Oct 15-31), Christmas (Dec 1-26), New Year (Dec 30-Jan 2), July 4th (Jul 1-5).
export const resolveOutfit = (setting, now = easternNow()) => {
  if (setting && setting !== "auto") return setting === "none" ? null : setting;
  const { m, d } = now;
  if (m === 10 && d >= 15) return "witch";
  if (m === 12 && d <= 26) return "santa";
  if ((m === 12 && d >= 30) || (m === 1 && d <= 2)) return "party";
  if (m === 7 && d <= 5) return "usa";
  return null;
};

const decorate = (markup, outfit, night) => {
  let out = markup.split(SHADES).join(night ? ASLEEP : AWAKE);
  const hat = outfit ? HATS[outfit] : night ? HATS.night : null;
  if (hat) out = out.split(CAP).join(hat);
  return out;
};

// Sal's 404 pose: lost, map upside down, scratching his head.
const HEAD = POSES.face.slice(POSES.face.indexOf(">") + 1, -4);
POSES.lost = '<g transform="translate(150 118)"><path d="M-95 170 Q-90 72 0 68 Q90 72 95 170 Z" fill="#047857"/><path d="M-22 70 L0 104 L22 70" fill="none" stroke="#ffffff" stroke-width="6" stroke-linejoin="round"/>' + HEAD
  + '<g class="sal-scratch"><path d="M-70 88 Q-112 40 -76 -26" stroke="#047857" stroke-width="28" fill="none" stroke-linecap="round"/><circle cx="-72" cy="-36" r="16" fill="#e0a878"/></g>'
  + '<g class="sal-map"><rect x="2" y="84" width="80" height="56" rx="4" fill="#fef3c7" stroke="#a16207" stroke-width="3"/><path d="M10 122 Q30 92 46 116 T74 100" stroke="#dc2626" stroke-width="4" fill="none" stroke-dasharray="6 5"/><text x="14" y="104" font-size="14" font-weight="700" fill="#a16207">N↑</text></g></g>';

// ---- Motion only after the visitor does something --------------------------------------------------
// Nothing about Sal moves while the page loads (keeps PageSpeed and Speed Index clean); the shades
// glint only after the first scroll, tap or key press.
let userActive = false;
const activeSubs = new Set();
if (typeof window !== "undefined") {
  const evs = ["pointerdown", "scroll", "keydown", "touchstart"];
  const on = () => {
    if (userActive) return;
    userActive = true;
    evs.forEach((e) => window.removeEventListener(e, on));
    activeSubs.forEach((f) => f());
  };
  evs.forEach((e) => window.addEventListener(e, on, { passive: true }));
}
const useUserActive = () => {
  const [a, setA] = useState(userActive);
  useEffect(() => {
    if (userActive) { setA(true); return undefined; }
    const f = () => setA(true);
    activeSubs.add(f);
    return () => activeSubs.delete(f);
  }, []);
  return a;
};
const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Sal's switches and lines: the server puts them in the page (window.__P2D_SAL__) so the first paint is
// already right; the store settings take over once loaded (e.g. right after the owner changes them).
export const useSal = () => {
  const { delivery } = useCart();
  const pre = typeof window !== "undefined" ? window.__P2D_SAL__ : null;
  const live = delivery && typeof delivery.salEnabled === "boolean";
  const enabled = live ? delivery.salEnabled : pre ? pre.enabled !== false : true;
  const animatedSetting = live && typeof delivery.salAnimated === "boolean" ? delivery.salAnimated : pre ? pre.animated !== false : true;
  const outfitSetting = (live && delivery.salOutfit) || (pre && pre.outfit) || "auto";
  const lines = live ? delivery.salLines || {} : (pre && pre.lines) || {};
  const now = easternNow();
  // The sleep cap after hours is part of "Auto" only; an outfit picked in Admin always shows as picked.
  const night = outfitSetting === "auto" && (now.h < 10 || now.h >= 22);
  return { enabled, animated: animatedSetting && !prefersReducedMotion(), outfit: resolveOutfit(outfitSetting, now), night, lines };
};

// One-shot CSS animation helper: returns [className, trigger()].
const useOneShot = (cls, ms) => {
  const [on, setOn] = useState(false);
  const t = useRef();
  useEffect(() => () => clearTimeout(t.current), []);
  const fire = () => { setOn(false); clearTimeout(t.current); requestAnimationFrame(() => { setOn(true); t.current = setTimeout(() => setOn(false), ms); }); };
  return [on ? cls : "", fire];
};

export const SalMascot = ({ pose = "avatar", size = 64, className = "", label, interactive = false, onTap }) => {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const sal = useSal();
  const live = useUserActive();
  const [wink, fireWink] = useOneShot("sal-wink", 1300);
  const inner = POSES[pose] || POSES.avatar;
  let markup = decorate(inner, sal.outfit, sal.night);
  if (pose === "avatar") markup = markup.split('id="av"').join(`id="sal${id}"`).split("url(#av)").join(`url(#sal${id})`);
  const anim = sal.animated;
  const tap = interactive ? () => { if (anim) fireWink(); if (onTap) onTap(); } : undefined;
  return (
    <svg
      viewBox="0 0 300 300" width={size} height={size}
      className={`shrink-0 sal-svg ${anim ? "sal-anim" : ""} ${anim && live ? "sal-live" : ""} ${wink} ${interactive ? "cursor-pointer" : ""} ${className}`}
      onClick={tap}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": "true", focusable: "false" })}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
};

const NIGHT_LINE = "Sal's off for the night. He's back on the road when the store opens at 10 AM.";
const SECRET_LINE = "Secret Sal fact: I've never once been late. Traffic has.";

// Sal plus one of his lines for this spot. Tap Sal for another line (5 quick taps for a secret one).
// peek: Sal pops up and winks the first time the spot scrolls into view (used in the footer).
// Shows nothing when Sal is switched off in Admin.
export const SalSays = ({ spot, pose = "avatar", size = 56, face = true, peek = false, className = "", textClassName = "", fallback = "" }) => {
  const sal = useSal();
  const { enabled, lines, animated } = sal;
  const list = lines[spot];
  const options = list && list.length ? list : fallback ? [fallback] : [];
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * 1000)); // one pick per visit
  const [secret, setSecret] = useState(false);
  const taps = useRef({ n: 0, t: 0 });
  const [hop, fireHop] = useOneShot("sal-hop", 700);
  const box = useRef(null);
  const [seen, setSeen] = useState(!peek || !animated);
  useEffect(() => {
    if (seen || !box.current || typeof IntersectionObserver === "undefined") { setSeen(true); return undefined; }
    const ob = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); fireHop(); ob.disconnect(); } }, { threshold: 0.6 });
    ob.observe(box.current);
    return () => ob.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!enabled || !options.length) return null;
  const nightSpot = sal.night && (spot === "banner" || spot === "deliveryPage");
  const line = secret ? SECRET_LINE : nightSpot && idx % 2 === 0 ? NIGHT_LINE : options[idx % options.length];
  const onTap = () => {
    const now = Date.now();
    taps.current = { n: now - taps.current.t < 1500 ? taps.current.n + 1 : 1, t: now };
    if (taps.current.n >= 5) { setSecret(true); taps.current.n = 0; } else { setSecret(false); setIdx((i) => i + 1 + (options.length > 2 ? Math.floor(Math.random() * (options.length - 1)) : 0)); }
    if (animated) fireHop();
  };
  return (
    <div ref={box} className={`flex items-center gap-3 ${peek && animated ? `sal-peek ${seen ? "sal-seen" : ""}` : ""} ${className}`} data-testid={`sal-${spot}`}>
      {face && <span className={`inline-flex shrink-0 ${hop}`}><SalMascot pose={pose} size={size} interactive onTap={onTap} /></span>}
      <p className={`m-0 ${textClassName}`} aria-live="polite">{line}</p>
    </div>
  );
};

// Free-delivery progress in the cart: Sal's car drives toward the free-delivery amount and honks when he gets there.
export const SalFreeDelivery = ({ subtotal, min }) => {
  const sal = useSal();
  const left = Math.max(0, min - subtotal);
  const prevLeft = useRef(left);
  const [honk, fireHonk] = useOneShot("sal-honk", 1100);
  useEffect(() => {
    if (prevLeft.current > 0 && left === 0 && sal.animated) fireHonk();
    prevLeft.current = left;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);
  if (!(min > 0)) return null;
  if (!sal.enabled) return left > 0 ? <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">Add ${left.toFixed(2)} more for FREE delivery!</p> : null;
  const p = Math.min(1, Math.max(0, subtotal / min));
  const move = sal.animated ? { transition: "left .7s cubic-bezier(.3,.8,.3,1)" } : {};
  return (
    <div className="rounded-lg bg-emerald-50 px-3 pt-2 pb-1" data-testid="sal-free-delivery">
      <p className="text-xs font-semibold text-emerald-700 m-0">{left > 0 ? `Add $${left.toFixed(2)} more and Sal delivers for FREE!` : "Free delivery unlocked! Sal's on it."}</p>
      <div className="relative h-10" aria-hidden="true">
        <div className="absolute left-0 right-5 bottom-2 h-2 rounded-full bg-emerald-100 overflow-hidden">
          <div className="h-full bg-emerald-600" style={{ width: `${p * 100}%`, transition: sal.animated ? "width .7s cubic-bezier(.3,.8,.3,1)" : undefined }} />
        </div>
        <span className="absolute right-0 bottom-1 text-sm leading-none">🏁</span>
        <span className={`absolute -bottom-1 ${honk}`} style={{ left: `calc(${p * 100}% - ${p * 64}px)`, ...move }}>
          <SalMascot pose="drive" size={48} />
        </span>
      </div>
    </div>
  );
};

// The car on the tracking page: drives from stop to stop as the order moves along.
const SalRoute = ({ step }) => {
  const sal = useSal();
  const [pos, setPos] = useState(sal.animated ? Math.max(0, step - 1) : step);
  useEffect(() => {
    if (!sal.animated) { setPos(step); return undefined; }
    const t = setTimeout(() => setPos(step), 400);
    return () => clearTimeout(t);
  }, [step, sal.animated]);
  const stops = ["Preparing", "Out for delivery", "Delivered"];
  return (
    <div className="relative h-[74px] mx-3 mt-2" aria-hidden="true">
      <div className="absolute left-0 right-0 top-[44px] border-t-4 border-dotted border-emerald-200" />
      {stops.map((s, i) => (
        <div key={s} className="absolute top-[38px] -translate-x-1/2" style={{ left: `${i * 50}%` }}>
          <span className={`block h-4 w-4 rounded-full border-2 border-white ${i <= pos ? "bg-emerald-600" : "bg-neutral-300"}`} />
          <span className="absolute top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold text-neutral-500">{s}</span>
        </div>
      ))}
      <span className="absolute top-0 -translate-x-1/2" style={{ left: `${pos * 50}%`, transition: sal.animated ? "left 1.4s cubic-bezier(.4,0,.2,1)" : undefined }}>
        <SalMascot pose="drive" size={48} />
      </span>
    </div>
  );
};

// Sal's line on an order's tracking: delivery orders only, never pickup, cancelled or unpaid orders.
export const SalOrderStatus = ({ order, className = "" }) => {
  if (!order || order.fulfillment === "pickup" || order.paymentStatus === "awaiting_payment") return null;
  const status = order.status;
  if (["cancelled", "returning_to_store", "returned", "id_check_failed"].includes(status)) return null;
  const spot = status === "delivered" ? "delivered" : status === "out_for_delivery" ? "outForDelivery" : "preparing";
  return <SalOrderBox spot={spot} className={className} />;
};

const SalOrderBox = ({ spot, className }) => {
  const sal = useSal();
  if (!sal.enabled) return null;
  return (
    <div className={`rounded-2xl bg-emerald-50 border border-emerald-100 p-3 pr-5 ${className}`}>
      <SalSays spot={spot} pose={spot === "outForDelivery" ? "drive" : "bag"} size={72} textClassName="text-sm font-semibold text-emerald-900 leading-snug" />
      <SalRoute step={spot === "delivered" ? 2 : spot === "outForDelivery" ? 1 : 0} />
    </div>
  );
};

// A small Sal pops up for a moment when something goes into the cart.
export const SalCartPop = () => {
  const sal = useSal();
  const [show, setShow] = useState(false);
  const t = useRef();
  useEffect(() => {
    const on = () => { setShow(true); clearTimeout(t.current); t.current = setTimeout(() => setShow(false), 1800); };
    window.addEventListener("p2d-cart-add", on);
    return () => { window.removeEventListener("p2d-cart-add", on); clearTimeout(t.current); };
  }, []);
  if (!sal.enabled || !sal.animated) return null;
  return (
    <div aria-hidden="true" className={`sal-cartpop fixed left-4 bottom-24 lg:bottom-6 z-[60] flex items-center gap-2 rounded-full bg-neutral-900 text-white pl-1 pr-4 py-1 text-sm font-semibold shadow-lg pointer-events-none ${show ? "sal-cartpop-on" : ""}`}>
      <SalMascot pose="face" size={36} /> Nice pick!
    </div>
  );
};

export default SalMascot;
