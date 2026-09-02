import React from "react";
import { Link } from "react-router-dom";
import { ShoppingCart, Check } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useToast } from "../hooks/use-toast";

const ProductCard = ({ product }) => {
  const { addItem } = useCart();
  const { toast } = useToast();
  const [added, setAdded] = React.useState(false);

  const handleAdd = (e) => {
    e.preventDefault();
    e.stopPropagation();
    addItem(product, 1);
    setAdded(true);
    toast({ title: "Added to cart", description: product.name });
    setTimeout(() => setAdded(false), 1400);
  };

  return (
    <div className="group relative bg-white border border-neutral-200 rounded-lg overflow-hidden hover:shadow-xl hover:border-emerald-200 transition-all duration-300 flex flex-col">
      <Link to={`/shop/${product.slug}`} className="block relative aspect-square bg-neutral-50 overflow-hidden">
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className="product-card-img absolute inset-0 h-full w-full object-contain p-4 group-hover:opacity-0"
        />
        <img
          src={product.image2}
          alt={product.name}
          loading="lazy"
          className="product-card-img absolute inset-0 h-full w-full object-contain p-4 opacity-0 group-hover:opacity-100 group-hover:scale-105"
        />
        <span className="absolute top-3 left-3 bg-neutral-900/90 text-white text-[10px] font-semibold tracking-wide px-2.5 py-1 rounded-full uppercase">
          {product.category}
        </span>
      </Link>

      <div className="p-4 flex flex-col flex-1">
        <p className="text-[10px] font-bold text-emerald-600 tracking-[0.15em] uppercase mb-1">
          {product.category}
        </p>
        <Link to={`/shop/${product.slug}`} className="block">
          <h3 className="text-[13px] font-medium text-neutral-800 leading-snug line-clamp-2 min-h-[2.6em] hover:text-emerald-600 transition-colors">
            {product.name}
          </h3>
        </Link>
        <div className="mt-auto pt-3 flex items-center justify-between">
          <span className="font-heading text-xl text-neutral-900">${product.price.toFixed(2)}</span>
          <button
            onClick={handleAdd}
            className={`grid place-items-center h-9 w-9 rounded-full transition-all ${
              added ? "bg-emerald-600 text-white" : "bg-neutral-900 text-white hover:bg-emerald-600"
            }`}
            aria-label="Add to cart"
          >
            {added ? <Check className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
