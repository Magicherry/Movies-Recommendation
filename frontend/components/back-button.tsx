"use client";

import { useRouter } from "next/navigation";

export default function BackButton({ top = "80px" }: { top?: string }) {
  const router = useRouter();

  return (
    <button 
      onClick={() => router.back()} 
      className="btn-back" 
      style={{ top }}
      aria-label="Go back"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
    </button>
  );
}