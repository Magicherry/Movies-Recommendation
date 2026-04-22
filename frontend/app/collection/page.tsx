"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MovieCardGrid, { MovieCardItem } from "../../components/movie-card-grid";
import type { MovieDetailLinkOptions } from "../../lib/movie-detail-context";

export default function CollectionPage() {
  const router = useRouter();
  const [data, setData] = useState<{
    title: string;
    items: MovieCardItem[];
    scoreLabel?: string;
    detailLinkOptions?: MovieDetailLinkOptions;
  } | null>(null);

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
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ fontSize: '2rem', margin: 0, fontWeight: 700 }}>{data.title}</h1>
      </div>
      <MovieCardGrid
        items={data.items}
        scoreLabel={data.scoreLabel}
        rowMode={false}
        detailContext={data.detailLinkOptions?.context}
        detailUserId={data.detailLinkOptions?.userId}
        detailSourceItemId={data.detailLinkOptions?.sourceItemId}
      />
    </div>
  );
}