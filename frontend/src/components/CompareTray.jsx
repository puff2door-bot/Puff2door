import React, { useEffect, useState } from "react";
import { X, Scale, ShoppingCart } from "lucide-react";
import { getCompare, toggleCompare } from "../lib/customerExperience";
import { useCart } from "../context/CartContext";

const CompareTray = () => {
  const [items, setItems] = useState(getCompare);
  const { addItem } = useCart();
  useEffect(() => { const update = () => setItems(getCompare()); window.addEventListener("p2d-experience-change", update); return () => window.removeEventListener("p2d-experience-change", update); }, []);
  if (!items.length) return null;
  return <aside className="compare-tray" aria-label="Product comparison">
    <div className="flex items-center justify-between gap-3 mb-3"><p className="font-heading text-lg flex items-center gap-2"><Scale className="h-5 w-5 text-emerald-600" /> Compare ({items.length}/3)</p><button onClick={() => items.forEach(toggleCompare)} aria-label="Clear comparison"><X className="h-5 w-5" /></button></div>
    <div className="overflow-x-auto"><table className="w-full text-xs"><tbody>
      <tr><th>Product</th>{items.map((p) => <td key={p.id} className="font-semibold">{p.name}</td>)}</tr>
      <tr><th>Brand</th>{items.map((p) => <td key={p.id}>{p.brandName || "—"}</td>)}</tr>
      <tr><th>Category</th>{items.map((p) => <td key={p.id}>{p.category || "—"}</td>)}</tr>
      <tr><th>Price</th>{items.map((p) => <td key={p.id} className="font-bold">${Number(p.price).toFixed(2)}</td>)}</tr>
      <tr><th></th>{items.map((p) => <td key={p.id}><button disabled={!p.inStock} onClick={() => addItem(p)} className="inline-flex items-center gap-1 text-emerald-700 font-bold disabled:text-neutral-400"><ShoppingCart className="h-3 w-3" /> Add</button> <button onClick={() => toggleCompare(p)} className="ml-2 text-neutral-500">Remove</button></td>)}</tr>
    </tbody></table></div>
  </aside>;
};
export default CompareTray;
