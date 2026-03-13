"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const BG_PRESETS = [
  { name: "Obsidian", color: "#09090b" },
  { name: "Graphite", color: "#171717" },
  { name: "Charcoal", color: "#0c0c0c" },
  { name: "Midnight", color: "#0a0e17" },
  { name: "Umber", color: "#0f0d0c" },
  { name: "Dusk", color: "#121212" },
];

const THEMES = [
  { name: "Green", color: "#6ae100", hover: "#55b400" },
  { name: "Blue", color: "#3b82f6", hover: "#2563eb" },
  { name: "Purple", color: "#8b5cf6", hover: "#7c3aed" },
  { name: "Pink", color: "#ec4899", hover: "#db2777" },
  { name: "Orange", color: "#f97316", hover: "#ea580c" },
  { name: "Red", color: "#ef4444", hover: "#dc2626" },
  { name: "Mercedes Petronas", color: "#0ad8b7", hover: "#09b89a" }, // Mercedes F1
  { name: "Ferrari Red", color: "#EF1A2D", hover: "#cc1626" }, // Ferrari F1
  { name: "McLaren Papaya", color: "#FF8000", hover: "#e67300" }, // McLaren F1
  { name: "Aston Martin Racing Green", color: "#00665E", hover: "#004d47" }, // Aston Martin F1
  { name: "Porsche Racing Yellow", color: "#F9B200", hover: "#e6a400" }, // Porsche
  { name: "Gulf Racing Blue", color: "#92C1E9", hover: "#7baedb" }, // Gulf Oil
  { name: "Ford Blue", color: "#003478", hover: "#002a5f" }, // Ford Performance
  { name: "Emby", color: "#52B54B", hover: "#45a03f" },
  { name: "Jellyfin", color: "#00A4DC", hover: "#0089b8" },
];

const MIN_REC = 5;
const MAX_REC = 100;
const STEP_REC = 5;
const MIN_COL = 5;
const MAX_COL = 100;
const STEP_COL = 5;
const MIN_CAROUSEL_COUNT = 1;
const MAX_CAROUSEL_COUNT = 15;
const STEP_CAROUSEL_COUNT = 1;
const MIN_CAROUSEL_SECONDS = 5;
const MAX_CAROUSEL_SECONDS = 120;
const STEP_CAROUSEL_SECONDS = 5;

function parseStoredNumber(key: string, fallback: number, min: number, max: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export default function AppearanceSettings() {
  const [activeTheme, setActiveTheme] = useState(() => THEMES.find(t => t.name === "McLaren Papaya") ?? THEMES[0]);
  const [customColor, setCustomColor] = useState("#ffffff");
  const [isCustom, setIsCustom] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [tempColor, setTempColor] = useState("#ffffff");
  const [animations, setAnimations] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("streamx-animations");
    return saved !== null ? saved === "true" : true;
  });
  const [denseLayout, setDenseLayout] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("streamx-dense-layout");
    return saved === "true";
  });
  const [bgColor, setBgColor] = useState(() => {
    if (typeof window === "undefined") return "#0a0e17";
    const saved = localStorage.getItem("streamx-bg-color");
    if (saved && BG_PRESETS.some((p) => p.color === saved)) return saved;
    return "#0a0e17";
  });
  const [recCount, setRecCount] = useState(10);
  const [watchAgainCount, setWatchAgainCount] = useState(15);
  const [trendingCount, setTrendingCount] = useState(15);
  const [moreLikeThisCount, setMoreLikeThisCount] = useState(15);
  const [carouselCount, setCarouselCount] = useState(5);
  const [carouselIntervalSeconds, setCarouselIntervalSeconds] = useState(30);
  const [countsExpanded, setCountsExpanded] = useState(false);

  const allCountsEqual =
    recCount === watchAgainCount &&
    watchAgainCount === trendingCount &&
    trendingCount === moreLikeThisCount;

  useEffect(() => {
    const savedColor = localStorage.getItem("streamx-theme-color");
    if (savedColor) {
      const theme = THEMES.find(t => t.color === savedColor);
      if (theme) {
        setActiveTheme(theme);
        setIsCustom(false);
      } else {
        setCustomColor(savedColor);
        setTempColor(savedColor);
        setIsCustom(true);
        setActiveTheme({ name: "Custom", color: savedColor, hover: savedColor });
      }
    }
  }, []);

  useEffect(() => {
    setRecCount(parseStoredNumber("streamx-rec-count", 10, MIN_REC, MAX_REC));
    setWatchAgainCount(parseStoredNumber("streamx-watch-again-count", 15, MIN_COL, MAX_COL));
    setTrendingCount(parseStoredNumber("streamx-trending-count", 15, MIN_COL, MAX_COL));
    setMoreLikeThisCount(parseStoredNumber("streamx-more-like-this-count", 15, MIN_COL, MAX_COL));
    setCarouselCount(parseStoredNumber("streamx-carousel-count", 5, MIN_CAROUSEL_COUNT, MAX_CAROUSEL_COUNT));
    setCarouselIntervalSeconds(
      parseStoredNumber("streamx-carousel-interval-seconds", 30, MIN_CAROUSEL_SECONDS, MAX_CAROUSEL_SECONDS)
    );
  }, []);

  const makeCountHandlers = useCallback(
    (
      setter: React.Dispatch<React.SetStateAction<number>>,
      key: string,
      min: number,
      max: number
    ) => ({
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value, 10);
        setter(val);
        localStorage.setItem(key, val.toString());
      },
      onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        if (raw === "") return;
        const val = parseInt(raw, 10);
        if (!isNaN(val)) {
          const clamped = Math.min(max, Math.max(min, val));
          setter(clamped);
          localStorage.setItem(key, clamped.toString());
        }
      },
      onBlur: (e: React.FocusEvent<HTMLInputElement>, current: number) => {
        const val = parseInt(e.target.value, 10);
        if (isNaN(val) || val < min || val > max) {
          const fallback = Math.min(max, Math.max(min, current));
          setter(fallback);
          localStorage.setItem(key, fallback.toString());
        }
      },
    }),
    []
  );

  const recHandlers = useMemo(
    () => makeCountHandlers(setRecCount, "streamx-rec-count", MIN_REC, MAX_REC),
    [makeCountHandlers]
  );
  const watchAgainHandlers = useMemo(
    () => makeCountHandlers(setWatchAgainCount, "streamx-watch-again-count", MIN_COL, MAX_COL),
    [makeCountHandlers]
  );
  const trendingHandlers = useMemo(
    () => makeCountHandlers(setTrendingCount, "streamx-trending-count", MIN_COL, MAX_COL),
    [makeCountHandlers]
  );
  const moreLikeThisHandlers = useMemo(
    () => makeCountHandlers(setMoreLikeThisCount, "streamx-more-like-this-count", MIN_COL, MAX_COL),
    [makeCountHandlers]
  );
  const carouselCountHandlers = useMemo(
    () => makeCountHandlers(setCarouselCount, "streamx-carousel-count", MIN_CAROUSEL_COUNT, MAX_CAROUSEL_COUNT),
    [makeCountHandlers]
  );
  const carouselIntervalHandlers = useMemo(
    () =>
      makeCountHandlers(
        setCarouselIntervalSeconds,
        "streamx-carousel-interval-seconds",
        MIN_CAROUSEL_SECONDS,
        MAX_CAROUSEL_SECONDS
      ),
    [makeCountHandlers]
  );

  const unifiedCount = recCount;
  const setAllCounts = (val: number) => {
    const clamped = Math.min(MAX_COL, Math.max(MIN_COL, val));
    setRecCount(clamped);
    setWatchAgainCount(clamped);
    setTrendingCount(clamped);
    setMoreLikeThisCount(clamped);
    localStorage.setItem("streamx-rec-count", clamped.toString());
    localStorage.setItem("streamx-watch-again-count", clamped.toString());
    localStorage.setItem("streamx-trending-count", clamped.toString());
    localStorage.setItem("streamx-more-like-this-count", clamped.toString());
  };

  const handleUnifiedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setAllCounts(val);
  };
  const handleUnifiedInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") return;
    const val = parseInt(raw, 10);
    if (!isNaN(val)) setAllCounts(val);
  };
  const handleUnifiedBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < MIN_COL || val > MAX_COL) setAllCounts(unifiedCount);
  };

  const applyTheme = (theme: typeof THEMES[0]) => {
    document.documentElement.style.setProperty("--brand", theme.color);
    document.documentElement.style.setProperty("--brand-hover", theme.hover);
    localStorage.setItem("streamx-theme-color", theme.color);
    setActiveTheme(theme);
    setIsCustom(false);
  };

  const applyBgPreset = (color: string) => {
    document.documentElement.style.setProperty("--bg-base", color);
    localStorage.setItem("streamx-bg-color", color);
    setBgColor(color);
  };

  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTempColor(e.target.value);
  };

  const applyCustomColor = () => {
    setCustomColor(tempColor);
    setIsCustom(true);
    
    const customTheme = { name: "Custom", color: tempColor, hover: tempColor };
    setActiveTheme(customTheme);
    
    document.documentElement.style.setProperty("--brand", tempColor);
    document.documentElement.style.setProperty("--brand-hover", tempColor);
    localStorage.setItem("streamx-theme-color", tempColor);
    setShowColorPicker(false);
  };

  const cancelCustomColor = () => {
    setTempColor(customColor);
    setShowColorPicker(false);
  };

  const toggleAnimations = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    setAnimations(val);
    localStorage.setItem("streamx-animations", val.toString());
    if (!val) {
      document.body.classList.add("disable-animations");
    } else {
      document.body.classList.remove("disable-animations");
    }
  };

  const toggleLayout = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    setDenseLayout(val);
    localStorage.setItem("streamx-dense-layout", val.toString());
    if (val) {
      document.body.classList.add("dense-layout");
    } else {
      document.body.classList.remove("dense-layout");
    }
  };

  return (
    <section className="settings-card">
      <h2>Appearance</h2>

      <div className="setting-group">
        <label>Page Background</label>
        <p className="setting-desc">Set the background color for the entire site.</p>
        <div className="theme-options" style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {BG_PRESETS.map((preset) => (
            <button
              key={preset.name}
              className={`theme-btn ${bgColor === preset.color ? "active" : ""}`}
              style={{ backgroundColor: preset.color, border: "1px solid var(--border-soft)" }}
              onClick={() => applyBgPreset(preset.color)}
              title={preset.name}
            />
          ))}
        </div>
      </div>

      <div className="setting-group">
        <label>Theme Color</label>
        <p className="setting-desc">Choose a primary color for the application.</p>
        <div className="theme-options" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {THEMES.map(theme => (
            <button
              key={theme.name}
              className={`theme-btn ${!isCustom && activeTheme.name === theme.name ? "active" : ""}`}
              style={{ backgroundColor: theme.color }}
              onClick={() => applyTheme(theme)}
              title={theme.name}
            />
          ))}
          <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-soft)', margin: '0 4px' }}></div>
          <div style={{ position: 'relative' }}>
            <button 
              className={`theme-btn ${isCustom ? "active" : ""}`} 
              style={{ 
                position: 'relative', 
                overflow: 'hidden',
                background: isCustom ? customColor : 'conic-gradient(from 90deg, red, yellow, lime, aqua, blue, magenta, red)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: isCustom ? '2px solid transparent' : 'none'
              }}
              title="Custom Color"
              onClick={() => setShowColorPicker(!showColorPicker)}
            >
              {!isCustom && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ zIndex: 1, pointerEvents: 'none', filter: 'drop-shadow(0px 0px 2px rgba(0,0,0,0.8))' }}>
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              )}
            </button>

            {showColorPicker && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 12px)',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                minWidth: '220px'
              }}
              className="dropdown-panel"
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Custom Color</span>
                  <div className="color-swatch" style={{ backgroundColor: tempColor }} />
                </div>
                
                <div style={{ position: 'relative', height: '150px', width: '100%', borderRadius: 'var(--radius-panel)', overflow: 'hidden' }}>
                  <input 
                    type="color" 
                    value={tempColor} 
                    onChange={handleCustomColorChange}
                    style={{
                      position: 'absolute',
                      top: '-50%',
                      left: '-50%',
                      width: '200%',
                      height: '200%',
                      cursor: 'pointer',
                      border: 'none',
                      padding: 0,
                      margin: 0
                    }}
                  />
                  <div style={{ 
                    position: 'absolute', 
                    inset: 0, 
                    pointerEvents: 'none', 
                    border: '1px solid var(--border-soft)', 
                    borderRadius: 'var(--radius-panel)',
                    boxShadow: 'var(--shadow-inset)'
                  }} />
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={cancelCustomColor} className="btn-ghost" style={{ flex: 1 }}>
                    Cancel
                  </button>
                  <button 
                    type="button"
                    onClick={applyCustomColor}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: 'var(--text-main)',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      color: '#000',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      transition: 'transform 0.2s'
                    }}
                    onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
                    onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                    onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
                    onMouseUp={e => e.currentTarget.style.transform = 'scale(1.05)'}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="setting-group setting-group-block setting-group-block-collapsible">
        <button
          type="button"
          className="setting-block-header"
          onClick={() => setCountsExpanded((e) => !e)}
          aria-expanded={countsExpanded}
          aria-controls="display-counts-body"
        >
          <span className="setting-block-header-inner">
            <span className="setting-block-header-title">Display Counts</span>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="setting-block-chevron"
              aria-hidden
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
          {!countsExpanded && !allCountsEqual && (
            <span className="setting-block-badge">Custom</span>
          )}
        </button>
        <p className="setting-desc" id="display-counts-desc">
          How many items to show in each home and detail section. Edit each row below or use Set All to sync.
        </p>
        <div className="setting-block-body" id="display-counts-body">
        <div
          className="setting-row setting-row-expand-trigger"
          role="button"
          tabIndex={0}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("input")) return;
            setCountsExpanded((prev) => !prev);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setCountsExpanded((prev) => !prev);
            }
          }}
          aria-expanded={countsExpanded}
          aria-controls="display-counts-body"
        >
          <div className="setting-row-info">
            <h3>Set All Counts</h3>
            <p>
              {countsExpanded
                ? "Use one value for Recommendation, Watch It Again, Trending Now, and More Like This."
                : `Rec ${recCount} · Watch again ${watchAgainCount} · Trending ${trendingCount} · More ${moreLikeThisCount}. Expand to edit individually.`}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <input
              type="range"
              min={MIN_COL}
              max={MAX_COL}
              step={STEP_COL}
              value={unifiedCount}
              onChange={handleUnifiedChange}
              className="range-slider"
              style={{ "--slider-progress": `${((unifiedCount - MIN_COL) / (MAX_COL - MIN_COL)) * 100}%` } as React.CSSProperties}
            />
            <input
              type="number"
              min={MIN_COL}
              max={MAX_COL}
              value={unifiedCount}
              onChange={handleUnifiedInputChange}
              onBlur={handleUnifiedBlur}
              className="settings-number-input"
              style={{ width: "72px" }}
              aria-label="All display counts"
            />
          </div>
        </div>

        <div
          className={`setting-block-expandable ${countsExpanded ? "setting-block-expandable--open" : ""}`}
          aria-hidden={!countsExpanded}
        >
          <div className="setting-block-expandable-inner">
        <div className="setting-row">
          <div className="setting-row-info">
            <h3>Recommendation Count</h3>
            <p>Number of movies in your personalized feed.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <input
              type="range"
              min={MIN_REC}
              max={MAX_REC}
              step={STEP_REC}
              value={recCount}
              onChange={recHandlers.onChange}
              className="range-slider"
              style={{ "--slider-progress": `${((recCount - MIN_REC) / (MAX_REC - MIN_REC)) * 100}%` } as React.CSSProperties}
            />
            <input
              type="number"
              min={MIN_REC}
              max={MAX_REC}
              value={recCount}
              onChange={recHandlers.onInputChange}
              onBlur={(e) => recHandlers.onBlur(e, recCount)}
              className="settings-number-input"
              style={{ width: "72px" }}
              aria-label="Recommendation count"
            />
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-row-info">
            <h3>Watch It Again</h3>
            <p>Max items in the Watch It Again row on the home page.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <input
              type="range"
              min={MIN_COL}
              max={MAX_COL}
              step={STEP_COL}
              value={watchAgainCount}
              onChange={watchAgainHandlers.onChange}
              className="range-slider"
              style={{ "--slider-progress": `${((watchAgainCount - MIN_COL) / (MAX_COL - MIN_COL)) * 100}%` } as React.CSSProperties}
            />
            <input
              type="number"
              min={MIN_COL}
              max={MAX_COL}
              value={watchAgainCount}
              onChange={watchAgainHandlers.onInputChange}
              onBlur={(e) => watchAgainHandlers.onBlur(e, watchAgainCount)}
              className="settings-number-input"
              style={{ width: "72px" }}
              aria-label="Watch It Again count"
            />
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-row-info">
            <h3>Trending Now</h3>
            <p>Max items in the Trending Now row on the home page.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <input
              type="range"
              min={MIN_COL}
              max={MAX_COL}
              step={STEP_COL}
              value={trendingCount}
              onChange={trendingHandlers.onChange}
              className="range-slider"
              style={{ "--slider-progress": `${((trendingCount - MIN_COL) / (MAX_COL - MIN_COL)) * 100}%` } as React.CSSProperties}
            />
            <input
              type="number"
              min={MIN_COL}
              max={MAX_COL}
              value={trendingCount}
              onChange={trendingHandlers.onInputChange}
              onBlur={(e) => trendingHandlers.onBlur(e, trendingCount)}
              className="settings-number-input"
              style={{ width: "72px" }}
              aria-label="Trending Now count"
            />
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-row-info">
            <h3>More Like This</h3>
            <p>Max items in the More Like This row on movie detail pages.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <input
              type="range"
              min={MIN_COL}
              max={MAX_COL}
              step={STEP_COL}
              value={moreLikeThisCount}
              onChange={moreLikeThisHandlers.onChange}
              className="range-slider"
              style={{ "--slider-progress": `${((moreLikeThisCount - MIN_COL) / (MAX_COL - MIN_COL)) * 100}%` } as React.CSSProperties}
            />
            <input
              type="number"
              min={MIN_COL}
              max={MAX_COL}
              value={moreLikeThisCount}
              onChange={moreLikeThisHandlers.onInputChange}
              onBlur={(e) => moreLikeThisHandlers.onBlur(e, moreLikeThisCount)}
              className="settings-number-input"
              style={{ width: "72px" }}
              aria-label="More Like This count"
            />
          </div>
        </div>
          </div>
        </div>
        </div>
      </div>

      <div className="setting-group setting-group-block">
        <label>Hero Carousel</label>
        <p className="setting-desc">Configure autoplay interval and number of slides shown on the home banner.</p>
        <div className="setting-block-body">
        <div className="setting-row">
          <div className="setting-row-info">
            <h3>Slide Duration</h3>
            <p>Time between auto-advance transitions, in seconds.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <input
              type="range"
              min={MIN_CAROUSEL_SECONDS}
              max={MAX_CAROUSEL_SECONDS}
              step={STEP_CAROUSEL_SECONDS}
              value={carouselIntervalSeconds}
              onChange={carouselIntervalHandlers.onChange}
              className="range-slider"
              style={{ "--slider-progress": `${((carouselIntervalSeconds - MIN_CAROUSEL_SECONDS) / (MAX_CAROUSEL_SECONDS - MIN_CAROUSEL_SECONDS)) * 100}%` } as React.CSSProperties}
            />
            <input
              type="number"
              min={MIN_CAROUSEL_SECONDS}
              max={MAX_CAROUSEL_SECONDS}
              value={carouselIntervalSeconds}
              onChange={carouselIntervalHandlers.onInputChange}
              onBlur={(e) => carouselIntervalHandlers.onBlur(e, carouselIntervalSeconds)}
              className="settings-number-input"
              style={{ width: "80px" }}
              aria-label="Carousel slide duration in seconds"
            />
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-row-info">
            <h3>Slide Count</h3>
            <p>How many movies are included in the home carousel.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <input
              type="range"
              min={MIN_CAROUSEL_COUNT}
              max={MAX_CAROUSEL_COUNT}
              step={STEP_CAROUSEL_COUNT}
              value={carouselCount}
              onChange={carouselCountHandlers.onChange}
              className="range-slider"
              style={{ "--slider-progress": `${((carouselCount - MIN_CAROUSEL_COUNT) / (MAX_CAROUSEL_COUNT - MIN_CAROUSEL_COUNT)) * 100}%` } as React.CSSProperties}
            />
            <input
              type="number"
              min={MIN_CAROUSEL_COUNT}
              max={MAX_CAROUSEL_COUNT}
              value={carouselCount}
              onChange={carouselCountHandlers.onInputChange}
              onBlur={(e) => carouselCountHandlers.onBlur(e, carouselCount)}
              className="settings-number-input"
              style={{ width: "80px" }}
              aria-label="Carousel slide count"
            />
          </div>
        </div>
        </div>
      </div>

      <div className="setting-group setting-group-block">
        <label>Layout &amp; Motion</label>
        <p className="setting-desc">Page transitions and grid density.</p>
        <div className="setting-block-body">
      <div className="setting-row">
        <div className="setting-row-info">
          <h3>Enable Animations</h3>
          <p>Toggle page transitions and hover effects.</p>
        </div>
        <label className="toggle-switch">
          <input type="checkbox" checked={animations} onChange={toggleAnimations} />
          <span className="toggle-slider"></span>
        </label>
      </div>

      <div className="setting-row">
        <div className="setting-row-info">
          <h3>Dense Layout</h3>
          <p>Show more items per row on movie and community grids.</p>
        </div>
        <label className="toggle-switch">
          <input type="checkbox" checked={denseLayout} onChange={toggleLayout} />
          <span className="toggle-slider"></span>
        </label>
      </div>
        </div>
      </div>
    </section>
  );
}
