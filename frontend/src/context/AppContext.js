import React, { createContext, useContext, useEffect, useState } from "react";

const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  const [ageVerified, setAgeVerified] = useState(() => {
    return localStorage.getItem("p2d_age_ok") === "true";
  });

  const verifyAge = (ok) => {
    if (ok) {
      localStorage.setItem("p2d_age_ok", "true");
      setAgeVerified(true);
    } else {
      window.location.href = "https://www.google.com";
    }
  };

  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem("p2d_user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (user) localStorage.setItem("p2d_user", JSON.stringify(user));
    else localStorage.removeItem("p2d_user");
  }, [user]);

  return (
    <AppContext.Provider value={{ ageVerified, verifyAge, user, setUser }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);
