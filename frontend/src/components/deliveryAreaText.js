export const deliveryBannerText = (area) => {
  if (!area) return "Walk-ins welcome · Check our current delivery area.";
  if (area.mode === "radius") {
    return `Walk-ins welcome · Delivery within ${area.radiusMiles} miles of ${area.centerCity || `ZIP ${area.centerZip}`}.`;
  }
  const cities = [...new Set((area.areas || []).map((item) => item.city).filter(Boolean))];
  const zips = [...new Set((area.areas || []).flatMap((item) => (item.zips || []).map((entry) => entry.zip)).filter(Boolean))];
  const cityText = cities.length <= 3 ? cities.join(cities.length === 2 ? " and " : ", ") : `${cities.slice(0, 3).join(", ")} + ${cities.length - 3} more`;
  const zipText = zips.length <= 4 ? zips.join(", ") : `${zips.length} ZIPs`;
  if (!cityText) return "Walk-ins welcome · Check our current delivery area.";
  return `Walk-ins welcome · Delivery to ${cityText}${zipText ? ` · ZIP${zips.length === 1 ? "" : "s"} ${zipText}` : ""}.`;
};

// Phones: the banner line without "Walk-ins welcome" and ZIP list, so it fits next to "See area".
export const deliveryBannerShort = (area) => {
  if (!area || area.mode === "radius") return deliveryBannerText(area).replace("Walk-ins welcome · ", "");
  const cities = [...new Set((area.areas || []).map((item) => item.city).filter(Boolean))];
  if (!cities.length) return "Check our current delivery area.";
  const cityText = cities.length <= 3 ? cities.join(cities.length === 2 ? " & " : ", ") : `${cities.slice(0, 3).join(", ")} + more`;
  return `Delivering to ${cityText}`;
};
