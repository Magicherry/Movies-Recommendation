"use client";

import { useRef, useState, useEffect, useCallback, ReactNode } from "react";

type ScrollableRowProps = {
  title?: string;
  titleStyle?: React.CSSProperties;
  onHeaderClick?: () => void;
  headerIcon?: ReactNode;
  headerTitle?: string;
  headerContainerStyle?: React.CSSProperties;
  children: ReactNode;
  listStyle?: React.CSSProperties;
  containerStyle?: React.CSSProperties;
};

export default function ScrollableRow({
  title,
  titleStyle,
  onHeaderClick,
  headerIcon,
  headerTitle,
  headerContainerStyle,
  children,
  listStyle,
  containerStyle,
}: ScrollableRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [showControls, setShowControls] = useState(false);

  const updateScrollState = useCallback(() => {
    const row = rowRef.current;
    if (!row) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      setShowControls(false);
      return;
    }
    const maxScrollLeft = Math.max(0, row.scrollWidth - row.clientWidth);
    const epsilon = 1;
    setCanScrollLeft(row.scrollLeft > epsilon);
    setCanScrollRight(row.scrollLeft < maxScrollLeft - epsilon);
    setShowControls(row.scrollWidth > row.clientWidth);
  }, []);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    const onRecalculate = () => updateScrollState();
    row.addEventListener("scroll", onRecalculate, { passive: true });
    window.addEventListener("resize", onRecalculate);

    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(onRecalculate)
      : null;
    resizeObserver?.observe(row);

    const rafId = window.requestAnimationFrame(onRecalculate);

    return () => {
      row.removeEventListener("scroll", onRecalculate);
      window.removeEventListener("resize", onRecalculate);
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(rafId);
    };
  }, [updateScrollState, children]);

  const scrollLeft = useCallback(() => {
    if (rowRef.current) {
      rowRef.current.scrollBy({ left: -rowRef.current.clientWidth * 0.8, behavior: "smooth" });
    }
  }, []);
  const scrollRight = useCallback(() => {
    if (rowRef.current) {
      rowRef.current.scrollBy({ left: rowRef.current.clientWidth * 0.8, behavior: "smooth" });
    }
  }, []);

  return (
    <div className="card-row-section">
      {title && (
        <div className="row-header-container" style={headerContainerStyle}>
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              cursor: onHeaderClick ? 'pointer' : 'default', 
              opacity: 0.9, 
              transition: 'opacity 0.2s' 
            }}
            onClick={onHeaderClick}
            title={headerTitle}
            onMouseEnter={(e) => { if (onHeaderClick) e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={(e) => { if (onHeaderClick) e.currentTarget.style.opacity = '0.9'; }}
          >
            <h2 className="row-header" style={titleStyle}>{title}</h2>
            {headerIcon}
          </div>
          {showControls && (
            <div className="row-controls">
              <button className="row-scroll-btn" onClick={scrollLeft} aria-label="Scroll left" disabled={!canScrollLeft}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>
              <button className="row-scroll-btn" onClick={scrollRight} aria-label="Scroll right" disabled={!canScrollRight}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            </div>
          )}
        </div>
      )}
      <div className="card-row-container" style={containerStyle}>
        <div className="card-row hide-scrollbar" ref={rowRef} style={listStyle}>
          {children}
        </div>
      </div>
    </div>
  );
}
