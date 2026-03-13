"use client";

import { useEffect } from "react";

const DEFAULT_BG = "#0a0e17";
const DEFAULT_BRAND = "#FF8000";
const DEFAULT_BRAND_HOVER = "#e67300";

/**
 * Applies saved theme color and page background from localStorage on mount.
 * Uses Blue Black + McLaren Papaya as defaults when nothing is saved.
 */
export default function ThemeSync() {
  useEffect(() => {
    const themeColor = localStorage.getItem("streamx-theme-color");
    if (themeColor) {
      document.documentElement.style.setProperty("--brand", themeColor);
      document.documentElement.style.setProperty("--brand-hover", themeColor);
    } else {
      document.documentElement.style.setProperty("--brand", DEFAULT_BRAND);
      document.documentElement.style.setProperty("--brand-hover", DEFAULT_BRAND_HOVER);
    }
    const bgColor = localStorage.getItem("streamx-bg-color");
    document.documentElement.style.setProperty("--bg-base", bgColor || DEFAULT_BG);
  }, []);
  return null;
}
