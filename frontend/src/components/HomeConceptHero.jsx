import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Clock3, MapPin, ShieldCheck, Sparkles, Truck, Zap } from "lucide-react";
import { imgUrl } from "../api";

const THEME_COPY = {
  neon: {
    eyebrow: "Altamonte after dark",
    title: "The local smoke shop, recharged.",
    description: "Fresh drops, fast local delivery and real-time tracking—wrapped in an electric storefront built for Altamonte Springs.",
    primary: "Shop the drop",
    secondary: "Check delivery",
  },
  blue: {
    eyebrow: "Curated locally · delivered smoothly",
    title: "Cool picks. Clear choices. Local delivery.",
    description: "A calm, modern way to discover new arrivals, trusted favorites and same-day local delivery from HD Smoke Shop.",
    primary: "Explore the collection",
    secondary: "See delivery area",
  },
};

const HomeConceptHero = ({ layout, products = [], categories = [], sameDayEnabled }) => {
  const copy = THEME_COPY[layout] || THEME_COPY.neon;
  const spotlight = products.filter((product) => product?.image).slice(0, 3);
  const quickCategories = categories.slice(0, 6);

  return (
    <section className={`concept-hero concept-hero-${layout}`} aria-labelledby={`${layout}-hero-title`}>
      <div className="concept-ambient concept-ambient-one" aria-hidden="true" />
      <div className="concept-ambient concept-ambient-two" aria-hidden="true" />
      <div className="concept-grid" aria-hidden="true" />

      <div className="concept-hero-inner">
        <div className="concept-copy">
          <div className="concept-eyebrow"><Sparkles aria-hidden="true" /> {copy.eyebrow}</div>
          <h1 id={`${layout}-hero-title`}>{copy.title}</h1>
          <p className="concept-description">{copy.description}</p>

          <div className="concept-actions">
            <Link to="/shop" className="concept-button concept-button-primary">
              {copy.primary} <ArrowUpRight aria-hidden="true" />
            </Link>
            <Link to="/delivery-area" className="concept-button concept-button-secondary">
              {copy.secondary} <MapPin aria-hidden="true" />
            </Link>
          </div>

          <div className="concept-trust" aria-label="Store highlights">
            <span><Clock3 aria-hidden="true" /> Open daily 10–10</span>
            <span><ShieldCheck aria-hidden="true" /> 21+ ID verified</span>
            <span><Truck aria-hidden="true" /> {sameDayEnabled ? "Same-day local" : "Scheduled local"}</span>
          </div>
        </div>

        <div className="concept-stage" aria-label="Featured new arrivals">
          <div className="concept-stage-label"><Zap aria-hidden="true" /> Fresh on the shelf</div>
          <div className="concept-orbit" aria-hidden="true" />
          <div className="concept-product-stack">
            {spotlight.map((product, index) => (
              <Link
                to={`/shop/${product.slug}`}
                className={`concept-product concept-product-${index + 1}`}
                key={product.id}
                aria-label={`Shop ${product.name}`}
              >
                <span className="concept-product-index">0{index + 1}</span>
                <img src={imgUrl(product.image)} alt="" loading={index === 0 ? "eager" : "lazy"} decoding="async" />
                <span className="concept-product-name">{product.name}</span>
              </Link>
            ))}
            {spotlight.length === 0 && <div className="concept-product-empty">New arrivals loading</div>}
          </div>
          <div className="concept-live-pill"><span aria-hidden="true" /> Live inventory</div>
        </div>
      </div>

      <div className="concept-category-rail" aria-label="Popular categories">
        <span className="concept-rail-label">Start here</span>
        <div className="concept-category-links">
          {quickCategories.map((category, index) => (
            <Link to={`/product-category/${category.slug}`} key={category.slug}>
              <span>0{index + 1}</span>{category.name}<ArrowUpRight aria-hidden="true" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HomeConceptHero;
