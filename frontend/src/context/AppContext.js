import React, { createContext, useContext, useEffect, useState } from "react";
import api, { setToken, getToken } from "../api";

const AppContext = createContext(null);
const GOOGLE_SCRIPT_ID = "google-identity-services";

const loadGoogleScript = () => new Promise((resolve, reject) => {
  if (window.google?.accounts?.oauth2) return resolve(window.google);
  const existing = document.getElementById(GOOGLE_SCRIPT_ID);
  if (existing) {
    existing.addEventListener("load", () => resolve(window.google), { once: true });
    existing.addEventListener("error", () => reject(new Error("Could not load Google sign-in")), { once: true });
    return;
  }
  const script = document.createElement("script");
  script.id = GOOGLE_SCRIPT_ID;
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.defer = true;
  script.onload = () => resolve(window.google);
  script.onerror = () => reject(new Error("Could not load Google sign-in"));
  document.head.appendChild(script);
});

export const AppProvider = ({ children }) => {
  const [ageVerified, setAgeVerified] = useState(() => {
    return localStorage.getItem("p2d_age_ok") === "true";
  });
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [googleClientId, setGoogleClientId] = useState("");

  const verifyAge = (ok) => {
    if (ok) {
      localStorage.setItem("p2d_age_ok", "true");
      setAgeVerified(true);
    } else {
      window.location.href = "https://www.google.com";
    }
  };

  // Load current user if token exists
  useEffect(() => {
    const loadUser = async () => {
      if (getToken()) {
        try {
          const { data } = await api.get("/auth/me");
          setUser(data.user);
        } catch {
          setToken(null);
          setUser(null);
        }
      }
      setAuthLoading(false);
    };
    loadUser();
  }, []);

  useEffect(() => {
    api.get("/auth/providers").then(({ data }) => {
      const clientId = data?.google?.clientId || "";
      setGoogleClientId(clientId);
      if (clientId) loadGoogleScript().catch(() => {});
    }).catch(() => {});
  }, []);

  const login = async (email, password, rememberMe = false) => {
    const { data } = await api.post("/auth/login", { email, password, rememberMe });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const resetPassword = async (token, password) => {
    const { data } = await api.post("/auth/reset-password", { token, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    setToken(data.token);
    setUser(data.user);
    return { ...data.user, signupBonusPoints: data.signupBonusPoints || 0 };
  };

  const loginWithGoogle = async () => {
    if (!googleClientId) throw new Error("Google sign-in has not been configured yet");
    const google = await loadGoogleScript();
    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: "openid email profile",
        callback: async (response) => {
          if (response.error || !response.access_token) {
            reject(new Error(response.error_description || response.error || "Google sign-in was cancelled"));
            return;
          }
          try {
            const { data } = await api.post("/auth/google/token", { access_token: response.access_token });
            setToken(data.token);
            setUser(data.user);
            resolve(data.user);
          } catch (error) {
            reject(error);
          }
        },
        error_callback: (error) => reject(new Error(error?.message || "Google sign-in could not be opened")),
      });
      client.requestAccessToken({ prompt: "select_account" });
    });
  };

  const logout = () => {
    api.post("/auth/logout").catch(() => {});
    setToken(null);
    setUser(null);
  };

  return (
    <AppContext.Provider
      value={{ ageVerified, verifyAge, user, setUser, login, register, resetPassword, loginWithGoogle, logout, authLoading }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);
