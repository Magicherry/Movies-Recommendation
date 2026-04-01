"use client";

import { useEffect, useRef, useState } from "react";
import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useUser } from "../context/user-context";

function useShowBrandAlgorithm(): boolean {
  const [show, setShow] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("streamx-show-brand-algorithm") !== "false";
  });
  useEffect(() => {
    const handler = () => setShow(localStorage.getItem("streamx-show-brand-algorithm") !== "false");
    window.addEventListener("streamx-settings-changed", handler);
    return () => window.removeEventListener("streamx-settings-changed", handler);
  }, []);
  return show;
}

export default function AppNavbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userId, maxUserId, setUserId } = useUser();
  const [inputId, setInputId] = useState(userId.toString());
  const [activeEngine, setActiveEngine] = useState<string>("Demo");
  const engineFetchSeqRef = useRef(0);
  const showBrandAlgorithm = useShowBrandAlgorithm();

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
            setActiveEngine('MF-SGD');
          } else if (data.active_model === 'option2') {
            setActiveEngine('NCF');
          } else if (data.active_model === 'option3_ridge') {
            setActiveEngine('SVD-Ridge');
          } else if (data.active_model === 'option3_lasso') {
            setActiveEngine('SVD-Lasso');
          } else if (data.active_model === 'option3') {
            setActiveEngine('SVD');
          } else if (data.active_model === 'option4') {
            setActiveEngine('MF-ALS');
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
    if (!isNaN(parsed) && parsed > 0 && parsed <= maxUserId) {
      if (parsed !== userId) setUserId(parsed);
      setIsMenuOpen(false);
    } else {
      // Revert to current valid userId if input is invalid
      setInputId(userId.toString());
    }
  };

  const shouldShowBackButton =
    /^\/movies\/[^/]+$/.test(pathname) ||
    /^\/person\/[^/]+$/.test(pathname) ||
    /^\/users\/[^/]+$/.test(pathname) ||
    pathname.startsWith("/collection") ||
    pathname.startsWith("/cast");

  const handleBackClick = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  };

  return (
    <header className={`top-nav ${isScrolled ? "scrolled" : ""}`}>
      <div className="simple-nav">
        <div className="brand-wrap">
          <div className={`nav-back-btn-wrapper ${shouldShowBackButton ? 'visible' : ''}`}>
            <button
              type="button"
              className="nav-back-btn"
              onClick={handleBackClick}
              aria-label="Go back"
              tabIndex={shouldShowBackButton ? 0 : -1}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
          </div>
          <span className="brand-link brand-link-static" aria-label="STREAMX">
            <span style={{ color: 'var(--brand)' }}>STREAM</span>X
          </span>
          {showBrandAlgorithm && (
            <span className="option-badge" title="Current Recommendation Engine">{activeEngine}</span>
          )}
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
                  max={maxUserId.toString()}
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