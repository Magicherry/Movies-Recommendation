"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

type UserContextType = {
  userId: number;
  maxUserId: number;
  setUserId: (id: number) => void;
};

const UserContext = createContext<UserContextType | undefined>(undefined);
const USER_ID_MIN = 1;
const DEFAULT_USER_ID_MAX = 999999;

function parseValidUserId(raw: string | null): number | null {
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < USER_ID_MIN || parsed > DEFAULT_USER_ID_MAX) {
    return null;
  }
  return parsed;
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserIdState] = useState<number | null>(null);
  const [maxUserId, setMaxUserId] = useState<number>(DEFAULT_USER_ID_MAX);

  useEffect(() => {
    // Fetch actual max user ID from the backend
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8001/api";
    fetch(`${API_BASE}/users?limit=1&offset=0`)
      .then(res => res.json())
      .then(data => {
        if (data.total && data.total > 0 && data.items && data.items.length > 0) {
          // Fetch last page to find the actual max user ID
          fetch(`${API_BASE}/users?limit=1&offset=${data.total - 1}`)
            .then(res2 => res2.json())
            .then(data2 => {
              if (data2.items && data2.items.length > 0) {
                setMaxUserId(data2.items[0].user_id);
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Load user ID before rendering app content to avoid race/flicker.
    const stored = localStorage.getItem("streamx_user_id");
    const parsedUserId = parseValidUserId(stored);
    const initialUserId = parsedUserId ?? USER_ID_MIN;
    setUserIdState(initialUserId);
    if (parsedUserId === null) {
      localStorage.setItem("streamx_user_id", String(initialUserId));
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
        { name: "Mercedes Petronas", color: "#0ad8b5", hover: "#09b89a" },
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

    // Keep user ID in sync across tabs/windows.
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== "streamx_user_id") return;
      const nextUserId = parseValidUserId(e.newValue);
      if (nextUserId !== null) {
        setUserIdState(nextUserId);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const setUserId = (id: number) => {
    if (!Number.isInteger(id) || id < USER_ID_MIN || id > maxUserId) return;
    setUserIdState(id);
    localStorage.setItem("streamx_user_id", id.toString());
  };

  if (userId === null) {
    return null;
  }

  return (
    <UserContext.Provider value={{ userId, maxUserId, setUserId }}>
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
