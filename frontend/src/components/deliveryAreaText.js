// The store's home city is always listed first.
const HOME_CITY = "Altamonte Springs";
const cityList = (area) => {
  const cities = [...new Set((area.areas || []).map((item) => item.city).filter(Boolean))];
  return cities.sort((a, b) => (b === HOME_CITY) - (a === HOME_CITY));
};

export const deliveryBannerText = (area) => {
  if (!area) return "Walk-ins welcome · Check our current delivery area.";
  if (area.mode === "radius") {
    return `Walk-ins welcome · Delivery within ${area.radiusMiles} miles of ${area.centerCity || `ZIP ${area.centerZip}`}.`;
  }
  const cities = cityList(area);
  const cityText = cities.length <= 3 ? cities.join(cities.length === 2 ? " and " : ", ") : `${cities.slice(0, 3).join(", ")} + ${cities.length - 3} more`;
  if (!cityText) return "Walk-ins welcome · Check our current delivery area.";
  // ZIP codes live on the delivery area page and the ZIP checker, not in the header bar.
  return `Walk-ins welcome · Delivery to ${cityText}.`;
};

// Phones: the banner line without "Walk-ins welcome" and ZIP list, so it fits next to "See area".
export const deliveryBannerShort = (area) => {
  if (!area || area.mode === "radius") return deliveryBannerText(area).replace("Walk-ins welcome · ", "");
  const cities = cityList(area);
  if (!cities.length) return "Check our current delivery area.";
  const cityText = cities.length <= 3 ? cities.join(cities.length === 2 ? " & " : ", ") : `${cities.slice(0, 3).join(", ")} + more`;
  return `Delivering to ${cityText}`;
};
