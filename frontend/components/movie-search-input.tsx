"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface MovieSuggestion {
  item_id: number;
  title: string;
  poster_url: string;
}

interface MovieSearchInputProps {
  defaultValue?: string;
  autoFocus?: boolean;
}

export default function MovieSearchInput({ defaultValue = "", autoFocus = false }: MovieSearchInputProps) {
  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<MovieSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    setQuery(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const fetchSuggestions = async () => {
      setIsLoading(true);
      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8001/api";
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.items.slice(0, 8)); // Show up to 8 suggestions
          setIsOpen(true);
        }
      } catch (err) {
        console.error("Failed to fetch suggestions", err);
      } finally {
        setIsLoading(false);
      }
    };

    const debounceTimer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounceTimer);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      const selected = suggestions[selectedIndex];
      router.push(`/movies/${selected.item_id}`);
      setIsOpen(false);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div className="search-input-wrapper" ref={wrapperRef}>
      <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      <input
        id="movie-search-input"
        type="text"
        name="q"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedIndex(-1);
        }}
        onFocus={() => {
          if (suggestions.length > 0) setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Search movies by title..."
        className="search-input custom-search-input"
        autoFocus={autoFocus}
        autoComplete="off"
      />
      
      {isOpen && suggestions.length > 0 && (
        <div className="suggestions-dropdown" style={{
          position: "absolute",
          top: "100%",
          left: 0,
          width: "400px", // Use fixed width instead of max/min width to prevent layout shift
          marginTop: "12px",
          backgroundColor: "rgba(24, 24, 27, 0.95)", // Match custom-select-dropdown
          backdropFilter: "blur(16px)", // Match custom-select-dropdown
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid var(--border-soft)",
          borderRadius: "20px", // Larger border radius
          boxShadow: "0 10px 25px rgba(0,0,0,0.5)", // Match custom-select-dropdown
          zIndex: 50,
          overflow: "hidden",
          padding: "8px 0", // Match custom-select-dropdown padding
          animation: "dropdownFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
        }}>
          {suggestions.map((movie, index) => (
            <Link
              key={movie.item_id}
              href={`/movies/${movie.item_id}`}
              className={`suggestion-item ${index === selectedIndex ? "selected" : ""}`}
              onClick={() => setIsOpen(false)}
              style={{
                position: "relative", // Needed for absolute positioning of the arrow
                display: "flex",
                alignItems: "center",
                padding: "8px 12px",
                paddingRight: "48px", // Add padding to make room for the absolute arrow
                margin: "4px 8px", // Match custom-select-option margin
                gap: "16px",
                textDecoration: "none",
                color: "var(--text-primary)",
                backgroundColor: index === selectedIndex ? "rgba(255, 255, 255, 0.1)" : "transparent", // Match custom-select-option hover
                borderRadius: "12px", // Match custom-select-option border-radius
                transition: "all 0.2s ease", // Match custom-select-option transition
                transform: index === selectedIndex ? "scale(1.02)" : "scale(1)",
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {movie.poster_url ? (
                <img 
                  src={movie.poster_url} 
                  alt={movie.title} 
                  style={{ 
                    width: "44px", 
                    height: "66px", 
                    objectFit: "cover", 
                    borderRadius: "8px",
                    boxShadow: index === selectedIndex ? "0 4px 12px rgba(0,0,0,0.5)" : "0 2px 6px rgba(0,0,0,0.3)",
                    transition: "transform 0.2s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.2s ease",
                    transform: index === selectedIndex ? "scale(1.05)" : "scale(1)"
                  }} 
                />
              ) : (
                <div style={{ 
                  width: "44px", 
                  height: "66px", 
                  backgroundColor: "rgba(255, 255, 255, 0.05)", 
                  borderRadius: "8px", 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center",
                  border: "1px solid var(--border-soft)",
                  transition: "transform 0.2s cubic-bezier(0.25, 1, 0.5, 1)",
                  transform: index === selectedIndex ? "scale(1.05)" : "scale(1)"
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
                    <line x1="7" y1="2" x2="7" y2="22"></line>
                    <line x1="17" y1="2" x2="17" y2="22"></line>
                  </svg>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1, paddingLeft: "4px" }}>
                <span style={{ 
                  fontWeight: 600, 
                  fontSize: "1.05rem",
                  whiteSpace: "nowrap", 
                  overflow: "hidden", 
                  textOverflow: "ellipsis",
                  color: index === selectedIndex ? "#fff" : "var(--text-main)",
                  transition: "color 0.2s ease"
                }}>
                  {movie.title.replace(/\s*\(\d{4}\)\s*$/, "")}
                </span>
                <span style={{ 
                  fontSize: "0.85rem", 
                  fontWeight: 500,
                  color: index === selectedIndex ? "var(--brand)" : "var(--text-subtle)",
                  marginTop: "4px",
                  transition: "color 0.2s ease"
                }}>
                  {movie.title.match(/\((\d{4})\)/)?.[1] || "Unknown Year"}
                </span>
              </div>
              
              {index === selectedIndex && (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  backgroundColor: "var(--brand)",
                  color: "#000",
                  animation: "fadeIn 0.2s ease",
                  flexShrink: 0,
                  boxShadow: "0 2px 8px rgba(106, 225, 0, 0.4)",
                  position: "absolute", // Position absolute to prevent layout shift
                  right: "12px"
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "2px" }}>
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
