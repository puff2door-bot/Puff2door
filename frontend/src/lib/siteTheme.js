export const SITE_THEMES = ["classic", "showcase", "minimal", "neon", "blue"];

const PREVIEW_KEY = "p2d_site_theme_preview";

export const getThemePreview = (search = "") => {
  if (typeof window === "undefined") return null;
  const requested = new URLSearchParams(search || window.location.search).get("homepagePreview");
  if (SITE_THEMES.includes(requested)) {
    sessionStorage.setItem(PREVIEW_KEY, requested);
    return requested;
  }
  const remembered = sessionStorage.getItem(PREVIEW_KEY);
  return SITE_THEMES.includes(remembered) ? remembered : null;
};

export const resolveSiteTheme = (savedTheme, search = "") =>
  getThemePreview(search) || (SITE_THEMES.includes(savedTheme) ? savedTheme : "classic");

export const themeLabel = (theme) => ({
  classic: "Classic Store",
  showcase: "Modern Showcase",
  minimal: "Premium Minimal",
  neon: "Neon After Dark",
  blue: "Cool Blue",
}[theme] || "Classic Store");
