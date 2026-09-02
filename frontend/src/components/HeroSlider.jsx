import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { heroSlides } from "../mock";

const HeroSlider = () => {
  const [idx, setIdx] = useState(0);
  const n = heroSlides.length;

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % n), 5500);
    return () => clearInterval(t);
  }, [n]);

  const go = (d) => setIdx((i) => (i + d + n) % n);

  return (
    <section className="relative w-full h-[380px] sm:h-[460px] lg:h-[560px] overflow-hidden bg-neutral-900">
      {heroSlides.map((s, i) => (
        <div
          key={s.id}
          className={`hero-slide absolute inset-0 ${i === idx ? "opacity-100 z-10" : "opacity-0 z-0"}`}
        >
          <img src={s.image} alt={s.title} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-neutral-900/80 via-neutral-900/40 to-transparent" />
          <div className="absolute inset-0 flex items-center">
            <div className="max-w-[1280px] w-full mx-auto px-6 lg:px-4">
              <div className="max-w-xl">
                <span className="inline-block bg-emerald-600 text-white text-[11px] font-bold tracking-[0.2em] uppercase px-3 py-1.5 rounded-full mb-4">
                  Puff2Door
                </span>
                <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-700 text-white leading-tight mb-3">
                  {s.title}
                </h1>
                <p className="text-neutral-200 text-base sm:text-lg mb-7 max-w-md">{s.subtitle}</p>
                <Link
                  to={s.link}
                  className="inline-flex items-center px-7 py-3.5 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-700 transition-colors"
                >
                  {s.cta}
                </Link>
              </div>
            </div>
          </div>
        </div>
      ))}

      <button onClick={() => go(-1)} className="absolute left-4 top-1/2 -translate-y-1/2 z-20 grid place-items-center h-11 w-11 rounded-full bg-white/20 backdrop-blur text-white hover:bg-emerald-600 transition-colors">
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button onClick={() => go(1)} className="absolute right-4 top-1/2 -translate-y-1/2 z-20 grid place-items-center h-11 w-11 rounded-full bg-white/20 backdrop-blur text-white hover:bg-emerald-600 transition-colors">
        <ChevronRight className="h-6 w-6" />
      </button>

      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex gap-2">
        {heroSlides.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            className={`h-2 rounded-full transition-all ${i === idx ? "w-8 bg-emerald-500" : "w-2 bg-white/60"}`}
          />
        ))}
      </div>
    </section>
  );
};

export default HeroSlider;
