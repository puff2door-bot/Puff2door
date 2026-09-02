import React, { createContext, useContext, useEffect, useState } from "react";
import api, { setToken, getToken } from "../api";

const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  const [ageVerified, setAgeVerified] = useState(() => {
    return localStorage.getItem("p2d_age_ok") === "true";
  });
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

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
    // Skip when returning from Google OAuth: AuthCallback exchanges the session_id first.
    if (window.location.hash?.includes("session_id=")) {
      setAuthLoading(false);
      return;
    }
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
    return data.user;
  };

  const loginWithGoogle = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/my-account";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const completeGoogleSession = async (sessionId) => {
    const { data } = await api.post("/auth/google/session", { session_id: sessionId });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    api.post("/auth/logout").catch(() => {});
    setToken(null);
    setUser(null);
  };

  return (
    <AppContext.Provider
      value={{ ageVerified, verifyAge, user, setUser, login, register, resetPassword, loginWithGoogle, completeGoogleSession, logout, authLoading }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);
