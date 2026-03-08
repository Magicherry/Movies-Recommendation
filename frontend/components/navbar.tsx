"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";

export default function AppNavbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isActive = (path: string) => {
    if (path === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(path);
  };

  return (
    <header className={`top-nav ${isScrolled ? "scrolled" : ""}`}>
      <div className="simple-nav">
        <div className="brand-wrap">
          <NextLink href="/" className="brand-link">
            STREAMX
          </NextLink>
          <span className="option-badge">CS550</span>
        </div>
        <nav className="nav-links">
          <NextLink href="/" className={`nav-link ${isActive("/") ? "active" : ""}`}>
            Home
          </NextLink>
          <NextLink href="/movies" className={`nav-link ${isActive("/movies") ? "active" : ""}`}>
            Movies
          </NextLink>
          <NextLink href="/users" className={`nav-link ${isActive("/users") ? "active" : ""}`}>
            Community
          </NextLink>
        </nav>
        <div className="nav-right">
          <NextLink href="/recommend" title="For You" style={{ textDecoration: 'none' }}>
            <div className={`nav-avatar ${isActive("/recommend") ? "active" : ""}`}>
              U
            </div>
          </NextLink>
        </div>
      </div>
    </header>
  );
}