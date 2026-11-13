export const DEFAULT_MIX_SAVE = {
  enabled: false,
  animationEnabled: false,
  animationStyle: "none",
  discountType: "percent",
  discountValue: 10,
  minQuantity: 2,
  minSubtotal: 50,
  eligibleCategorySlugs: [],
  eligibleProductIds: [],
  buttonText: "Mix & Save 10%",
};

export const isMixSaveEligible = (product, rules = DEFAULT_MIX_SAVE) => Boolean(
  rules.enabled && product && (
    (rules.eligibleCategorySlugs || []).includes(product.categorySlug)
    || (rules.eligibleProductIds || []).includes(Number(product.id ?? product.productId))
  )
);

export const calculateMixSave = (items, rules = DEFAULT_MIX_SAVE, promoDiscount = 0, cartSubtotal = null) => {
  const subtotal = cartSubtotal == null
    ? items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0)
    : Number(cartSubtotal || 0);
  let selectedQuantity = 0;
  let bundleSubtotal = 0;
  items.forEach((item) => {
    if (!isMixSaveEligible(item, rules)) return;
    const selected = Math.min(Math.max(Number(item.mixSaveQty || 0), 0), Number(item.qty || 0));
    selectedQuantity += selected;
    bundleSubtotal += selected * Number(item.price || 0);
  });
  const promoAllocated = subtotal > 0 ? Math.min(bundleSubtotal, Number(promoDiscount || 0) * bundleSubtotal / subtotal) : 0;
  const qualifyingSubtotal = Math.max(bundleSubtotal - promoAllocated, 0);
  const qualified = Boolean(rules.enabled && selectedQuantity >= Number(rules.minQuantity || 2) && qualifyingSubtotal > Number(rules.minSubtotal || 50));
  const rawDiscount = rules.discountType === "flat"
    ? Number(rules.discountValue || 0)
    : qualifyingSubtotal * Number(rules.discountValue || 0) / 100;
  const discount = qualified ? Math.round(Math.min(rawDiscount, qualifyingSubtotal) * 100) / 100 : 0;
  return {
    ...rules,
    qualified,
    selectedQuantity,
    bundleSubtotal: Math.round(bundleSubtotal * 100) / 100,
    qualifyingSubtotal: Math.round(qualifyingSubtotal * 100) / 100,
    promoAllocated: Math.round(promoAllocated * 100) / 100,
    itemsRemaining: Math.max(Number(rules.minQuantity || 2) - selectedQuantity, 0),
    amountRemaining: qualified || qualifyingSubtotal > Number(rules.minSubtotal || 50)
      ? 0
      : Math.round(Math.max(Number(rules.minSubtotal || 50) - qualifyingSubtotal + 0.01, 0.01) * 100) / 100,
    discount,
  };
};
