"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

type UserContextType = {
  userId: number;
  setUserId: (id: number) => void;
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserIdState] = useState<number>(1);

  useEffect(() => {
    // Load user ID
    const stored = localStorage.getItem("streamx_user_id");
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed > 0) {
        setUserIdState(parsed);
      }
    }

    // Apply global appearance settings
    const savedColor = localStorage.getItem("streamx-theme-color");
    if (savedColor) {
      const THEMES = [
        { name: "Green (Default)", color: "#6ae100", hover: "#55b400" },
        { name: "Blue", color: "#3b82f6", hover: "#2563eb" },
        { name: "Purple", color: "#8b5cf6", hover: "#7c3aed" },
        { name: "Pink", color: "#ec4899", hover: "#db2777" },
        { name: "Orange", color: "#f97316", hover: "#ea580c" },
        { name: "Red", color: "#ef4444", hover: "#dc2626" },
        { name: "Mercedes Petronas", color: "#0ad8b7", hover: "#09b89a" },
        { name: "Ferrari Red", color: "#EF1A2D", hover: "#cc1626" },
        { name: "McLaren Papaya", color: "#FF8000", hover: "#e67300" },
        { name: "Aston Martin Racing Green", color: "#00665E", hover: "#004d47" },
        { name: "Porsche Racing Yellow", color: "#F9B200", hover: "#e6a400" },
        { name: "Gulf Racing Blue", color: "#92C1E9", hover: "#7baedb" },
        { name: "Ford Blue", color: "#003478", hover: "#002a5f" },
        { name: "Emby", color: "#52B54B", hover: "#45a03f" },
        { name: "Jellyfin", color: "#00A4DC", hover: "#0089b8" },
      ];
      const theme = THEMES.find(t => t.color === savedColor);
      if (theme) {
        document.documentElement.style.setProperty("--brand", theme.color);
        document.documentElement.style.setProperty("--brand-hover", theme.hover);
      } else {
        // Handle custom color
        document.documentElement.style.setProperty("--brand", savedColor);
        // Simple hover color approximation for custom color (just using the same color for now)
        document.documentElement.style.setProperty("--brand-hover", savedColor);
      }
    }

    const savedAnim = localStorage.getItem("streamx-animations");
    if (savedAnim === "false") {
      document.body.classList.add("disable-animations");
    }

    const savedLayout = localStorage.getItem("streamx-dense-layout");
    if (savedLayout === "true") {
      document.body.classList.add("dense-layout");
    }
  }, []);

  const setUserId = (id: number) => {
    setUserIdState(id);
    localStorage.setItem("streamx_user_id", id.toString());
  };

  return (
    <UserContext.Provider value={{ userId, setUserId }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
