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

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
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

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AppContext.Provider
      value={{ ageVerified, verifyAge, user, setUser, login, register, logout, authLoading }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);
