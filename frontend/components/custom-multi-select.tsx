"use client";

import { useState, useRef, useEffect } from "react";

export type Option = {
  value: string;
  label: string;
};

type CustomMultiSelectProps = {
  name: string;
  options: Option[];
  defaultValue: string;
  placeholder?: string;
};

export default function CustomMultiSelect({ name, options, defaultValue, placeholder = "Select..." }: CustomMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Parse initial selected values
  const [selectedValues, setSelectedValues] = useState<Set<string>>(
    new Set(defaultValue ? defaultValue.split("|").filter(Boolean) : [])
  );
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedValues(new Set(defaultValue ? defaultValue.split("|").filter(Boolean) : []));
  }, [defaultValue]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (val: string) => {
    const newSet = new Set(selectedValues);
    if (val === "") {
        // "All Genres" selected -> clear all
        newSet.clear();
        setIsOpen(false); // Optionally close when "All Genres" is selected
    } else {
        if (newSet.has(val)) {
            newSet.delete(val);
        } else {
            newSet.add(val);
        }
    }
    setSelectedValues(newSet);
  };

  const selectedLabels = Array.from(selectedValues)
    .map(v => options.find(o => o.value === v)?.label)
    .filter(Boolean) as string[];

  return (
    <div className="custom-select-container" ref={dropdownRef}>
      <input type="hidden" name={name} value={Array.from(selectedValues).join("|")} />
      
      <div 
        className={`custom-select-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title={selectedLabels.join(", ")}
      >
        {selectedLabels.length > 0 ? (
          <div 
            className="multi-select-chips"
            style={{ 
              display: "flex", 
              gap: "6px", 
              overflowX: "auto", 
              width: "100%",
              paddingRight: "8px"
            }}
            onClick={(e) => {
              // Allows scrolling by swiping without necessarily closing/opening
              // but we want clicking the container to open the select.
            }}
          >
            {selectedLabels.map(label => (
              <span 
                key={label} 
                className="multi-select-chip"
                style={{ 
                  background: "#323235", 
                  color: "#ffffff",
                  padding: "4px 10px", 
                  borderRadius: "var(--radius-sm)", 
                  fontSize: "0.85rem", 
                  whiteSpace: "nowrap",
                  fontWeight: 600,
                  border: "none",
                  display: "inline-flex",
                  alignItems: "center"
                }}
              >
                {label}
              </span>
            ))}
          </div>
        ) : (
          <span className="custom-select-label" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {options.find(o => o.value === "")?.label || placeholder}
          </span>
        )}
        <svg className="custom-select-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>

      {isOpen && (
        <div className="custom-select-dropdown" style={{ maxHeight: "300px", overflowY: "auto" }}>
          {options.map((option) => {
            const isSelected = option.value === "" 
              ? selectedValues.size === 0 
              : selectedValues.has(option.value);
              
            return (
              <div
                key={option.value}
                className={`custom-select-option ${isSelected ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation(); // prevent closing
                  toggleOption(option.value);
                }}
                style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "center",
                  background: isSelected ? "var(--brand)" : undefined,
                  color: isSelected ? "white" : undefined,
                  fontWeight: isSelected ? 600 : "normal"
                }}
              >
                <span>{option.label}</span>
                {isSelected && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
