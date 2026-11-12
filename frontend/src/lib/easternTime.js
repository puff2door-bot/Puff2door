export const EASTERN_TIME_ZONE = "America/New_York";

export const formatEasternDateTime = (value, fallback = "Not run yet") => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
};

export const formatEasternClock = (hour, minute = 0) => {
  const safeHour = Number(hour) || 0;
  const safeMinute = Number(minute) || 0;
  const suffix = safeHour >= 12 ? "PM" : "AM";
  const displayHour = safeHour % 12 || 12;
  return `${displayHour}:${String(safeMinute).padStart(2, "0")} ${suffix} ET`;
};

export const easternDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
