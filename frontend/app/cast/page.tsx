"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "../../components/back-button";
import Link from "next/link";

type PersonData = {
  id?: number;
  name: string;
  profile_path?: string;
  character?: string;
};

type CastData = {
  title: string;
  directors: PersonData[];
  cast: PersonData[];
};

export default function CastPage() {
  const router = useRouter();
  const [data, setData] = useState<CastData | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("personListData");
    if (stored) {
      try {
        setData(JSON.parse(stored));
        // Ensure the page scrolls to the top when loaded
        window.scrollTo(0, 0);
      } catch (e) {
        console.error("Failed to parse cast data", e);
      }
    } else {
      // If no data is found (e.g., direct navigation), go back
      router.back();
    }
  }, [router]);

  if (!data) return null;

  const renderPerson = (person: PersonData, role: string, idx: number, type: 'dir' | 'cast') => {
    const isClickable = !!person.id;
    const content = (
      <div className={isClickable ? "person-card-hover" : ""} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '140px', position: 'relative' }}>
        <div style={{ 
          width: '120px', height: '120px', borderRadius: '50%', overflow: 'hidden', marginBottom: '12px',
          backgroundColor: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          transition: 'transform 0.2s, box-shadow 0.2s',
          ...(isClickable ? { cursor: 'pointer' } : {})
        }} className={isClickable ? "person-avatar-inner" : ""}>
          {person.profile_path ? (
            <img 
              src={`https://image.tmdb.org/t/p/w185${person.profile_path}`} 
              alt={person.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ color: '#888', fontSize: '40px' }}>{person.name.charAt(0)}</span>
          )}
        </div>
        <span style={{ fontSize: '1rem', fontWeight: 500, textAlign: 'center', color: '#eee', lineHeight: 1.2 }}>{person.name}</span>
        <span style={{ fontSize: '0.85rem', textAlign: 'center', color: '#aaa', marginTop: '4px', lineHeight: 1.2 }}>{role}</span>
      </div>
    );
    
    return isClickable ? (
      <Link key={`${type}-${idx}`} href={`/person/${person.id}?name=${encodeURIComponent(person.name)}`} style={{ textDecoration: 'none' }}>
        {content}
      </Link>
    ) : (
      <div key={`${type}-${idx}`}>{content}</div>
    );
  };

  return (
    <div className="page-transition" style={{ paddingBottom: '60px' }}>
      <BackButton top="40px" />
      
      <div className="content-padding" style={{ paddingTop: '100px' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '40px', color: 'var(--text-main)' }}>
          {data.title}
        </h1>

        {data.directors && data.directors.length > 0 && (
          <div style={{ marginBottom: '48px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '24px', color: 'white', borderBottom: '1px solid var(--border-soft)', paddingBottom: '12px' }}>
              Directors
            </h2>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', 
              gap: '32px 20px',
              justifyItems: 'center'
            }}>
              {data.directors.map((person, idx) => renderPerson(person, 'Director', idx, 'dir'))}
            </div>
          </div>
        )}

        {data.cast && data.cast.length > 0 && (
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '24px', color: 'white', borderBottom: '1px solid var(--border-soft)', paddingBottom: '12px' }}>
              Cast
            </h2>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', 
              gap: '32px 20px',
              justifyItems: 'center'
            }}>
              {data.cast.map((person, idx) => renderPerson(person, person.character || 'Actor', idx, 'cast'))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
