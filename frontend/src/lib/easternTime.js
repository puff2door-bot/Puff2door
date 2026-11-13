export const EASTERN_TIME_ZONE = "America/New_York";

// The server stores times in UTC. A time written without a zone ("2026-11-13T19:07:00") is UTC,
// not local time — read it that way so it shows the right Eastern time.
export const parseServerTime = (value) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value)) {
    return new Date(`${value}Z`);
  }
  return new Date(value);
};

export const formatEasternDateTime = (value, fallback = "Not run yet") => {
  if (!value) return fallback;
  const date = parseServerTime(value);
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

export const shiftDateKey = (dateKey, days = 0) => {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  if (!year || !month || !day) return "";
  const shifted = new Date(Date.UTC(year, month - 1, day + Number(days || 0)));
  return shifted.toISOString().slice(0, 10);
};
