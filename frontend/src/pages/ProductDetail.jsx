import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ChevronRight, Minus, Plus, ShoppingCart, Truck, ShieldCheck, RotateCcw, Star, Check } from "lucide-react";
import ProductCard from "../components/ProductCard";
import { getProductBySlug, getProductsByCategory } from "../mock";
import { useCart } from "../context/CartContext";
import { useToast } from "../hooks/use-toast";

const ProductDetail = () => {
  const { slug } = useParams();
  const product = getProductBySlug(slug);
  const { addItem } = useCart();
  const { toast } = useToast();
  const [qty, setQty] = useState(1);
  const [activeImg, setActiveImg] = useState(0);
  const [added, setAdded] = useState(false);

  if (!product) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-24 text-center">
        <h1 className="font-heading text-3xl mb-3">Product not found</h1>
        <Link to="/shop" className="text-emerald-600 font-bold">Back to Shop</Link>
      </div>
    );
  }

  const gallery = [product.image, product.image2].filter((v, i, a) => a.indexOf(v) === i);
  const related = getProductsByCategory(product.categorySlug).filter((p) => p.id !== product.id).slice(0, 5);

  const handleAdd = () => {
    addItem(product, qty);
    setAdded(true);
    toast({ title: "Added to cart", description: `${qty} × ${product.name}` });
    setTimeout(() => setAdded(false), 1600);
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 py-8">
      <nav className="flex items-center gap-1.5 text-xs text-neutral-500 mb-6 flex-wrap">
        <Link to="/" className="hover:text-emerald-600">Home</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link to={`/product-category/${product.categorySlug}`} className="hover:text-emerald-600">{product.category}</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-neutral-800 font-medium line-clamp-1">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Gallery */}
        <div>
          <div className="aspect-square bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden grid place-items-center p-6">
            <img src={gallery[activeImg]} alt={product.name} className="max-h-full max-w-full object-contain" />
          </div>
          {gallery.length > 1 && (
            <div className="flex gap-3 mt-4">
              {gallery.map((g, i) => (
                <button key={i} onClick={() => setActiveImg(i)} className={`h-20 w-20 rounded-lg border-2 overflow-hidden bg-neutral-50 p-2 ${activeImg === i ? "border-emerald-600" : "border-neutral-200"}`}>
                  <img src={g} alt="" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <p className="text-xs font-bold text-emerald-600 tracking-[0.15em] uppercase mb-2">{product.category}</p>
          <h1 className="font-heading text-3xl sm:text-4xl font-700 text-neutral-900 leading-tight mb-3">{product.name}</h1>
          <div className="flex items-center gap-2 mb-5">
            <div className="flex text-amber-400">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={`h-4 w-4 ${i < Math.round(product.rating) ? "fill-current" : ""}`} />
              ))}
            </div>
            <span className="text-sm text-neutral-500">{product.rating.toFixed(1)} · In stock</span>
          </div>

          <p className="font-heading text-4xl text-neutral-900 mb-6">${product.price.toFixed(2)}</p>
          <p className="text-neutral-600 leading-relaxed mb-7">{product.description}</p>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex items-center border border-neutral-300 rounded-full">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-11 w-11 grid place-items-center hover:text-emerald-600"><Minus className="h-4 w-4" /></button>
              <span className="w-10 text-center font-semibold">{qty}</span>
              <button onClick={() => setQty((q) => q + 1)} className="h-11 w-11 grid place-items-center hover:text-emerald-600"><Plus className="h-4 w-4" /></button>
            </div>
            <button onClick={handleAdd} className={`flex-1 h-11 rounded-full font-bold text-white flex items-center justify-center gap-2 transition-colors ${added ? "bg-emerald-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>
              {added ? <><Check className="h-5 w-5" /> Added!</> : <><ShoppingCart className="h-5 w-5" /> Add to Cart</>}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 border-t pt-6">
            {[{ icon: Truck, t: "Fast Shipping" }, { icon: ShieldCheck, t: "Lab Tested" }, { icon: RotateCcw, t: "Easy Returns" }].map((f, i) => (
              <div key={i} className="flex flex-col items-center text-center gap-2">
                <f.icon className="h-6 w-6 text-emerald-600" />
                <span className="text-xs text-neutral-600 font-medium">{f.t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="pt-16">
          <h2 className="font-heading text-2xl sm:text-3xl font-700 uppercase tracking-tight mb-6">You May Also Like</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {related.map((p) => (<ProductCard key={p.id} product={p} />))}
          </div>
        </section>
      )}
    </div>
  );
};

export default ProductDetail;
