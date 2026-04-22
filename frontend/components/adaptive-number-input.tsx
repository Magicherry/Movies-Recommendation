"use client";

import { useMemo, useState } from "react";

type AdaptiveNumberInputProps = {
  name: string;
  defaultValue?: string | number;
  min?: number;
  max?: number;
  className?: string;
};

export function sanitizePositiveInteger(rawValue: string): string {
  const digitsOnly = rawValue.replace(/\D+/g, "");
  if (!digitsOnly) {
    return "";
  }
  return digitsOnly.replace(/^0+/, "");
}

export function clampPositiveInteger(value: number, min?: number, max?: number): number {
  const minValue = Number.isInteger(min) && Number(min) > 0 ? Number(min) : 1;
  const maxValue = Number.isInteger(max) && Number(max) >= minValue ? Number(max) : undefined;
  let nextValue = Number.isInteger(value) && value > 0 ? value : minValue;
  if (maxValue !== undefined) {
    nextValue = Math.min(nextValue, maxValue);
  }
  return Math.max(nextValue, minValue);
}

export default function AdaptiveNumberInput({
  name,
  defaultValue,
  min,
  max,
  className,
}: AdaptiveNumberInputProps) {
  const initialValue = useMemo(() => {
    if (defaultValue === undefined || defaultValue === null) {
      return "";
    }
    return String(defaultValue);
  }, [defaultValue]);

  const [value, setValue] = useState(initialValue);
  const fallbackValue = useMemo(() => {
    const parsed = Number.parseInt(initialValue, 10);
    return String(clampPositiveInteger(parsed, min, max));
  }, [initialValue, min, max]);
  const submittedValue = useMemo(() => {
    if (!value) {
      return fallbackValue;
    }
    const parsed = Number.parseInt(value, 10);
    return String(clampPositiveInteger(parsed, min, max));
  }, [value, fallbackValue, min, max]);
  const resolvedClassName = ["adaptive-number-input", className].filter(Boolean).join(" ");

  return (
    <>
      <input type="hidden" name={name} value={submittedValue} />
      <input
        type="text"
        inputMode="numeric"
        pattern="[1-9][0-9]*"
        value={value}
        onChange={(event) => setValue(sanitizePositiveInteger(event.target.value))}
        onBlur={() => setValue(submittedValue)}
        onWheel={(event) => (event.currentTarget as HTMLInputElement).blur()}
        className={resolvedClassName}
        aria-label={name}
        autoComplete="off"
        style={{ width: `${Math.max(value.length, 1) + 2.5}ch` }}
      />
    </>
  );
}
