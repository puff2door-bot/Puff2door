import React, { useState } from "react";
import { Eye, EyeOff, Check, X } from "lucide-react";

export const formatApiError = (detail, fallback = "Something went wrong. Please try again.") => {
  if (detail == null) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => (e && typeof e.msg === "string" ? e.msg.replace(/^Value error, /, "") : JSON.stringify(e))).join(" ");
  if (typeof detail.msg === "string") return detail.msg;
  return String(detail);
};

export const PASSWORD_RULES = [
  { key: "len", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { key: "letter", label: "Contains a letter", test: (p) => /[a-zA-Z]/.test(p) },
  { key: "number", label: "Contains a number", test: (p) => /\d/.test(p) },
];

export const isStrongEnough = (p) => PASSWORD_RULES.every((r) => r.test(p));

const strengthOf = (p) => {
  let score = PASSWORD_RULES.filter((r) => r.test(p)).length;
  if (p.length >= 12) score += 1;
  if (/[^a-zA-Z0-9]/.test(p)) score += 1;
  if (!p) return { level: 0, label: "", color: "bg-neutral-200" };
  if (score <= 2) return { level: 1, label: "Weak", color: "bg-red-500" };
  if (score === 3) return { level: 2, label: "Fair", color: "bg-amber-500" };
  if (score === 4) return { level: 3, label: "Good", color: "bg-emerald-500" };
  return { level: 4, label: "Strong", color: "bg-emerald-600" };
};

export const PasswordInput = ({ value, onChange, className, testId, showStrength = false, placeholder, autoComplete = "current-password" }) => {
  const [show, setShow] = useState(false);
  const strength = strengthOf(value);
  return (
    <div>
      <div className="relative">
        <input
          required
          type={show ? "text" : "password"}
          data-testid={testId}
          className={`${className} pr-11`}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          data-testid={testId ? `${testId}-toggle` : undefined}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {showStrength && (
        <div className="mt-2">
          <div className="flex gap-1 mb-1.5">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= strength.level ? strength.color : "bg-neutral-200"}`} />
            ))}
          </div>
          <div className="flex items-center justify-between">
            <ul className="flex flex-wrap gap-x-3 gap-y-1">
              {PASSWORD_RULES.map((r) => {
                const ok = r.test(value);
                return (
                  <li key={r.key} className={`inline-flex items-center gap-1 text-[11px] ${ok ? "text-emerald-600" : "text-neutral-400"}`}>
                    {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />} {r.label}
                  </li>
                );
              })}
            </ul>
            {strength.label && <span data-testid="password-strength-label" className="text-[11px] font-bold text-neutral-600">{strength.label}</span>}
          </div>
        </div>
      )}
    </div>
  );
};
