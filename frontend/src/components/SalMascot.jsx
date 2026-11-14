import React, { useId, useState } from "react";
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

export const SalMascot = ({ pose = "avatar", size = 64, className = "", label }) => {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const inner = POSES[pose] || POSES.avatar;
  const markup = pose === "avatar" ? inner.split('id="av"').join(`id="sal${id}"`).split("url(#av)").join(`url(#sal${id})`) : inner;
  return (
    <svg
      viewBox="0 0 300 300" width={size} height={size} className={`shrink-0 ${className}`}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": "true", focusable: "false" })}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
};

// Sal's switch and lines: the server puts them in the page (window.__P2D_SAL__) so the first paint is
// already right; the store settings take over once loaded (e.g. right after the owner changes them).
export const useSal = () => {
  const { delivery } = useCart();
  const pre = typeof window !== "undefined" ? window.__P2D_SAL__ : null;
  if (delivery && typeof delivery.salEnabled === "boolean") return { enabled: delivery.salEnabled, lines: delivery.salLines || {} };
  return { enabled: pre ? pre.enabled !== false : true, lines: (pre && pre.lines) || {} };
};

// Sal plus one of his lines for this spot. Shows nothing when Sal is switched off in Admin.
export const SalSays = ({ spot, pose = "avatar", size = 56, face = true, className = "", textClassName = "", fallback = "" }) => {
  const { enabled, lines } = useSal();
  const list = lines[spot];
  const [pick] = useState(() => Math.random()); // one pick per visit, so the line doesn't change while reading
  const options = list && list.length ? list : fallback ? [fallback] : [];
  const line = options.length ? options[Math.floor(pick * options.length)] : "";
  if (!enabled || !line) return null;
  return (
    <div className={`flex items-center gap-3 ${className}`} data-testid={`sal-${spot}`}>
      {face && <SalMascot pose={pose} size={size} />}
      <p className={`m-0 ${textClassName}`}>{line}</p>
    </div>
  );
};

// Sal's line on an order's tracking: delivery orders only, never pickup, cancelled or unpaid orders.
export const SalOrderStatus = ({ order, className = "" }) => {
  if (!order || order.fulfillment === "pickup" || order.paymentStatus === "awaiting_payment") return null;
  const status = order.status;
  if (["cancelled", "returning_to_store", "returned", "id_check_failed"].includes(status)) return null;
  const spot = status === "delivered" ? "delivered" : status === "out_for_delivery" ? "outForDelivery" : "preparing";
  return (
    <SalSays
      spot={spot}
      pose={spot === "outForDelivery" ? "drive" : "bag"}
      size={72}
      className={`rounded-2xl bg-emerald-50 border border-emerald-100 p-3 pr-5 ${className}`}
      textClassName="text-sm font-semibold text-emerald-900 leading-snug"
    />
  );
};

export default SalMascot;
