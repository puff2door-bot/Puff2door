import React from "react";
import { Leaf } from "lucide-react";
import { useApp } from "../context/AppContext";
import { BRAND } from "../mock";

const AgeGate = () => {
  const { ageVerified, verifyAge } = useApp();
  if (ageVerified) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/95 backdrop-blur-sm px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-fade-up">
        <div className="bg-neutral-900 py-8 flex flex-col items-center">
          <span className="grid place-items-center h-14 w-14 rounded-full bg-emerald-600 mb-3">
            <Leaf className="h-8 w-8 text-white" />
          </span>
          <span className="font-heading font-700 text-3xl text-white">
            Puff<span className="text-emerald-500">2</span>Door
          </span>
          <span className="text-[10px] tracking-[0.28em] text-neutral-400 uppercase mt-1">{BRAND.tagline}</span>
        </div>
        <div className="p-8 text-center">
          <h2 className="font-heading text-2xl text-neutral-900 mb-2">Are you 21 or older?</h2>
          <p className="text-sm text-neutral-500 mb-7">
            You must verify your age to enter this website. By clicking “Yes” you
            confirm you are of legal age to purchase tobacco &amp; vape products.
          </p>
          <div className="flex gap-3">
            <button
              data-testid="age-gate-no"
              onClick={() => verifyAge(false)}
              className="flex-1 py-3 rounded-full border-2 border-neutral-300 font-bold text-neutral-700 hover:bg-neutral-100 transition-colors"
            >
              No
            </button>
            <button
              data-testid="age-gate-yes"
              onClick={() => verifyAge(true)}
              className="flex-1 py-3 rounded-full bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors"
            >
              Yes, I am 21+
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgeGate;
