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
          className="btn-back"
          style={{ position: 'static', margin: 0, flexShrink: 0 }}
          aria-label="Go back"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <h1 style={{ fontSize: '2rem', margin: 0, fontWeight: 700 }}>{data.title}</h1>
      </div>
      <MovieCardGrid items={data.items} scoreLabel={data.scoreLabel} rowMode={false} />
    </div>
  );
}