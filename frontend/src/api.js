import axios from "axios";

const rawBackendUrl = (process.env.REACT_APP_BACKEND_URL || "").trim().replace(/\/$/, "");
const BACKEND_URL = rawBackendUrl && !/^https?:\/\//i.test(rawBackendUrl)
  ? `https://${rawBackendUrl}`
  : rawBackendUrl;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("p2d_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// An expired admin login used to make saves fail silently. Send the owner to the login page
// instead, and bring them back to the same admin page afterwards.
let redirecting = false;
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = String(error?.config?.url || "");
    const protectedStaffPage = typeof window !== "undefined" && (window.location.pathname.startsWith("/admin") || window.location.pathname === "/driver-app");
    if (status === 401 && protectedStaffPage && url.startsWith("/admin") && !redirecting) {
      redirecting = true;
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.assign(`/my-account?expired=1&next=${next}`);
    }
    return Promise.reject(error);
  },
);

export const setToken = () => {
  // Authentication is stored by the API in an HttpOnly cookie. Remove any
  // legacy browser-readable token left by older HD Smoke Shop releases.
  localStorage.removeItem("p2d_token");
  window.dispatchEvent(new Event("p2d-auth-change"));
};

export const getToken = () => localStorage.getItem("p2d_token");

export const imgUrl = (u) => (u && u.startsWith("/api/") ? `${BACKEND_URL}${u}` : u);

export default api;
