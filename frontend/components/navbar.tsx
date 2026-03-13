"use client";

import { useEffect, useRef, useState } from "react";
import NextLink from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useUser } from "../context/user-context";

export default function AppNavbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { userId, setUserId } = useUser();
  const [inputId, setInputId] = useState(userId.toString());
  const [activeEngine, setActiveEngine] = useState<string>("Demo");
  const engineFetchSeqRef = useRef(0);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001/api";

  useEffect(() => {
    setInputId(userId.toString());
  }, [userId]);

  useEffect(() => {
    let disposed = false;
    const fetchModel = async () => {
      const seq = ++engineFetchSeqRef.current;
      try {
        const res = await fetch(`${API_BASE}/model-config`);
        if (res.ok) {
          const data = await res.json();
          if (disposed || seq !== engineFetchSeqRef.current) return;
          if (data.active_model === 'option1') {
            setActiveEngine('MF');
          } else if (data.active_model === 'option2') {
            setActiveEngine('NCF');
          } else {
            setActiveEngine(data.active_model);
          }
        }
      } catch (err) {
        console.error("Failed to fetch model config", err);
      }
    };

    fetchModel();
    
    // Listen for the custom local storage event we added for force refresh (works across tabs)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'streamx-force-refresh') {
        fetchModel();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Listen for the custom event dispatched in the same tab
    window.addEventListener('streamx-engine-changed', fetchModel);
    
    // Also poll occasionally just in case
    const interval = setInterval(fetchModel, 30000);
    
    return () => {
      disposed = true;
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('streamx-engine-changed', fetchModel);
      clearInterval(interval);
    };
  }, [API_BASE]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMenuOpen]);

  const isActive = (path: string) => {
    // If we are on a collection page, use the 'from' query param to determine active state
    let effectivePathname = pathname;
    if (pathname.startsWith("/collection")) {
      const from = searchParams.get("from");
      if (from) {
        effectivePathname = from;
      } else {
        effectivePathname = "/"; // Default to home if no 'from' param
      }
    }

    if (path === "/") {
      return effectivePathname === "/";
    }
    return effectivePathname.startsWith(path);
  };

  const handleUserChange = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(inputId, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 610) {
      if (parsed !== userId) setUserId(parsed);
      setIsMenuOpen(false);
    } else {
      // Revert to current valid userId if input is invalid
      setInputId(userId.toString());
    }
  };

  return (
    <header className={`top-nav ${isScrolled ? "scrolled" : ""}`}>
      <div className="simple-nav">
        <div className="brand-wrap">
          <NextLink href="/" className="brand-link" onClick={() => setIsMenuOpen(false)}>
            <span style={{ color: 'var(--brand)' }}>STREAM</span>X
          </NextLink>
          <span className="option-badge" title="Current Recommendation Engine">{activeEngine}</span>
        </div>

        <button 
          className="mobile-menu-toggle"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Toggle menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {isMenuOpen ? (
              <><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></>
            ) : (
              <><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></>
            )}
          </svg>
        </button>

        <div className={`nav-content ${isMenuOpen ? "open" : ""}`}>
          <nav className="nav-links">
            <NextLink href="/" className={`nav-link ${isActive("/") ? "active" : ""}`} onClick={() => setIsMenuOpen(false)}>
              Home
            </NextLink>
            <NextLink href="/movies" className={`nav-link ${isActive("/movies") ? "active" : ""}`} onClick={() => setIsMenuOpen(false)}>
              Movies
            </NextLink>
            <NextLink href="/users" className={`nav-link ${isActive("/users") ? "active" : ""}`} onClick={() => setIsMenuOpen(false)}>
              Community
            </NextLink>
            <NextLink href="/settings" className={`nav-link ${isActive("/settings") ? "active" : ""}`} onClick={() => setIsMenuOpen(false)}>
              Settings
            </NextLink>
            <NextLink 
              href="/movies?focus=search" 
              className="nav-icon-link" 
              aria-label="Search Movies" 
              onClick={(e) => {
                if (pathname === '/movies') {
                  e.preventDefault();
                  const searchInput = document.getElementById('movie-search-input') as HTMLInputElement;
                  if (searchInput) {
                    searchInput.focus();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }
                setIsMenuOpen(false);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </NextLink>
          </nav>
          <div className="nav-right">
            <div className="user-profile-widget">
              <form onSubmit={handleUserChange} className="user-id-form">
                <span className="user-id-label">ID:</span>
                <input 
                  type="number" 
                  value={inputId} 
                  onChange={e => setInputId(e.target.value)}
                  onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                  className="user-id-input"
                  min="1"
                  max="610"
                />
                <button type="submit" style={{ display: 'none' }}>Set</button>
              </form>
              <div className="widget-divider"></div>
              <NextLink href={`/users/${userId}`} title="My Profile" className="nav-avatar-link" onClick={() => setIsMenuOpen(false)}>
                <div className={`nav-avatar ${isActive(`/users/${userId}`) || (pathname === "/settings" && searchParams.get("tab") === "account") ? "active" : ""}`} style={{ background: 'var(--bg-hover-soft)', overflow: 'hidden' }}>
                  <img 
                    src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${userId}`} 
                    alt={`User ${userId}`}
                    className="img-round"
                  />
                </div>
              </NextLink>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}