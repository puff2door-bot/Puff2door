import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("p2d_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const setToken = (token) => {
  if (token) localStorage.setItem("p2d_token", token);
  else localStorage.removeItem("p2d_token");
  window.dispatchEvent(new Event("p2d-auth-change"));
};

export const getToken = () => localStorage.getItem("p2d_token");

export const imgUrl = (u) => (u && u.startsWith("/api/") ? `${BACKEND_URL}${u}` : u);

export default api;
