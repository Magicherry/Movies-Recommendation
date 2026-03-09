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
    const stored = localStorage.getItem("streamx_user_id");
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed > 0) {
        setUserIdState(parsed);
      }
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
