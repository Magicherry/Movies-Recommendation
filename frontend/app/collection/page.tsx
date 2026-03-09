"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MovieCardGrid, { MovieCardItem } from "../../components/movie-card-grid";

export default function CollectionPage() {
  const router = useRouter();
  const [data, setData] = useState<{ title: string; items: MovieCardItem[]; scoreLabel?: string } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
      const stored = sessionStorage.getItem("collectionData");
      if (stored) {
        try {
          setData(JSON.parse(stored));
        } catch (e) {
          console.error("Failed to parse collectionData");
          router.push("/");
        }
      } else {
        router.push("/");
      }
    }
  }, [router]);

  if (!data) return null;

  return (
    <div className="page-container content-padding page-transition" style={{ paddingTop: '60px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '30px', gap: '16px' }}>
        <button 
          onClick={() => router.back()}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: 'white',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            flexShrink: 0
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          aria-label="Go back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'translateX(-1px)' }}>
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </button>
        <h1 style={{ fontSize: '2rem', margin: 0, fontWeight: 700 }}>{data.title}</h1>
      </div>
      <MovieCardGrid items={data.items} scoreLabel={data.scoreLabel} rowMode={false} />
    </div>
  );
}