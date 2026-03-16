"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import ScrollableRow from "./scrollable-row";

type PersonListProps = {
  directors: any[];
  cast: any[];
  tmdbId?: string | number;
  movieTitle?: string;
};

export default function PersonList({ directors, cast, tmdbId, movieTitle }: PersonListProps) {
  const router = useRouter();

  if (directors.length === 0 && cast.length === 0) {
    return null;
  }

  return (
    <div style={{ marginBottom: '40px' }}>
      <ScrollableRow
        title="Cast & Crew"
        titleStyle={{ fontSize: '1.25rem', color: 'white', margin: 0 }}
        headerContainerStyle={{ padding: 0, marginBottom: '16px' }}
        onHeaderClick={() => {
          if (typeof window !== "undefined") {
            sessionStorage.setItem("personListData", JSON.stringify({ 
              title: `Cast & Crew - ${movieTitle || 'Movie'}`, 
              directors, 
              cast 
            }));
            router.push(`/cast`);
          }
        }}
        headerTitle="View full cast & crew"
        headerIcon={
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-subtle)', transform: 'translateY(1px)' }}>
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        }
        listStyle={{ 
          gap: '20px', 
          paddingBottom: '16px',
          paddingTop: '16px', // Increased from 4px to prevent top clipping when avatar scales
          margin: '0',
          paddingLeft: '4vw',
          paddingRight: '4vw'
        }}
        containerStyle={{
          margin: '0 -4vw',
          paddingTop: '0'
        }}
      >
        {directors.map((person: any, idx: number) => {
          const isClickable = !!person.id;
          const content = (
            <>
              <div style={{ 
                width: '120px', height: '120px', borderRadius: '50%', overflow: 'hidden', marginBottom: '12px',
                backgroundColor: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                transition: 'transform 0.2s, box-shadow 0.2s',
                position: 'relative',
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
              <span style={{ fontSize: '0.85rem', textAlign: 'center', color: '#aaa', marginTop: '4px', lineHeight: 1.2 }}>Director</span>
            </>
          );
          
          const wrapperStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '140px', flexShrink: 0, scrollSnapAlign: 'start', position: 'relative' } as const;
          
          return isClickable ? (
            <Link key={`dir-${idx}`} href={`/person/${person.id}?name=${encodeURIComponent(person.name)}`} style={{ textDecoration: 'none', ...wrapperStyle }} className="person-card-hover">
              {content}
            </Link>
          ) : (
            <div key={`dir-${idx}`} style={wrapperStyle} className="person-card-hover">{content}</div>
          );
        })}
        
        {cast.map((person: any, idx: number) => {
          const isClickable = !!person.id;
          const content = (
            <>
              <div style={{ 
                width: '120px', height: '120px', borderRadius: '50%', overflow: 'hidden', marginBottom: '12px',
                backgroundColor: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                transition: 'transform 0.2s, box-shadow 0.2s',
                position: 'relative',
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
              <span style={{ fontSize: '0.85rem', textAlign: 'center', color: '#aaa', marginTop: '4px', lineHeight: 1.2 }}>{person.character}</span>
            </>
          );
          
          const wrapperStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '140px', flexShrink: 0, scrollSnapAlign: 'start', position: 'relative' } as const;
          
          return isClickable ? (
            <Link key={`cast-${idx}`} href={`/person/${person.id}?name=${encodeURIComponent(person.name)}`} style={{ textDecoration: 'none', ...wrapperStyle }} className="person-card-hover">
              {content}
            </Link>
          ) : (
            <div key={`cast-${idx}`} style={wrapperStyle} className="person-card-hover">{content}</div>
          );
        })}
      </ScrollableRow>
    </div>
  );
}
