import { calculateMixSave, isMixSaveEligible } from "./mixSave";

const rules = { enabled: true, discountType: "percent", discountValue: 10, minQuantity: 2, minSubtotal: 50, eligibleCategorySlugs: ["disposable", "delta"], eligibleProductIds: [] };

test("allows cross-category bundles only above the strict threshold", () => {
  const items = [
    { id: 1, categorySlug: "disposable", price: 30, qty: 1, mixSaveQty: 1 },
    { id: 2, categorySlug: "delta", price: 25, qty: 1, mixSaveQty: 1 },
  ];
  expect(calculateMixSave(items, rules).discount).toBe(5.5);
  expect(calculateMixSave(items, rules).qualified).toBe(true);
  expect(calculateMixSave([{ ...items[0], price: 25 }, items[1]], rules).qualified).toBe(false);
});

test("ignores unselected and ineligible quantities", () => {
  expect(isMixSaveEligible({ id: 1, categorySlug: "disposable" }, rules)).toBe(true);
  const result = calculateMixSave([
    { id: 1, categorySlug: "disposable", price: 60, qty: 2, mixSaveQty: 1 },
    { id: 3, categorySlug: "glass", price: 100, qty: 2, mixSaveQty: 2 },
  ], rules);
  expect(result.selectedQuantity).toBe(1);
  expect(result.qualified).toBe(false);
});

test("revalidates after a promo reduces qualifying spend", () => {
  const items = [{ id: 1, categorySlug: "disposable", price: 30, qty: 2, mixSaveQty: 2 }];
  expect(calculateMixSave(items, rules, 0, 60).qualified).toBe(true);
  expect(calculateMixSave(items, rules, 12, 60).qualified).toBe(false);
});
