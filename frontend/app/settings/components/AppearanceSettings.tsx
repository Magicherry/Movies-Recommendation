"use client";

import { useEffect, useState } from "react";

const BG_PRESETS = [
  { name: "Default", color: "#09090b" },
  { name: "Dark Gray", color: "#171717" },
  { name: "Charcoal", color: "#0c0c0c" },
  { name: "Blue Black", color: "#0a0e17" },
  { name: "Warm Black", color: "#0f0d0c" },
  { name: "Soft Black", color: "#121212" },
];

const THEMES = [
  { name: "Green (Default)", color: "#6ae100", hover: "#55b400" },
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
    </section>
  );
}
