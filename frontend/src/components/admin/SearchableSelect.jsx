import React, { useEffect, useId, useMemo, useRef, useState } from "react";

/**
 * Searchable list of existing records. Typing filters the list.
 * It never creates a category or brand.
 */
export default function SearchableSelect({
  label,
  options,
  value,
  onChange,
  placeholder = "Search",
  emptyOption = null,
  unmatched = false,
  unmatchedLabel = "Unmatched, pick one",
  disabled = false,
  testId,
  required = false,
  labelClassName = "block text-sm font-bold",
  buttonClassName = "block border rounded-xl p-3 w-full mt-2 text-left font-normal text-base bg-white",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value);
  const shown = unmatched && !selected ? unmatchedLabel : (selected?.label || emptyOption?.label || placeholder);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = emptyOption ? [emptyOption, ...options] : options;
    if (!needle) return rows;
    return rows.filter((option) => option.label.toLowerCase().includes(needle) || String(option.value).toLowerCase().includes(needle));
  }, [emptyOption, options, query]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const choose = (next) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && filtered[highlight]) {
      event.preventDefault();
      choose(filtered[highlight].value);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative" data-testid={testId}>
      {label && <span className={labelClassName}>{label}{required ? " *" : ""}</span>}
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        data-testid={testId ? `${testId}-button` : undefined}
        className={`${buttonClassName} disabled:opacity-50 ${unmatched && !selected ? "text-amber-800 border-amber-400" : "text-neutral-900"}`}
        onClick={() => { setOpen((current) => !current); setHighlight(0); }}
      >
        {shown}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border bg-white shadow-lg p-2">
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setHighlight(0); }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            data-testid={testId ? `${testId}-search` : undefined}
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600"
            aria-autocomplete="list"
            aria-controls={listId}
          />
          <ul id={listId} role="listbox" className="mt-2 max-h-56 overflow-auto">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-neutral-500">No matches</li>}
            {filtered.map((option, index) => (
              <li key={`${option.value}-${option.label}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  data-testid={testId ? `${testId}-option-${option.value || "none"}` : undefined}
                  className={`w-full text-left px-3 py-2 text-sm rounded-lg ${index === highlight ? "bg-emerald-50" : "hover:bg-neutral-50"} ${option.value === value ? "font-bold text-emerald-700" : ""}`}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => choose(option.value)}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
