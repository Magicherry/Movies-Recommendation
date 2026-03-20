import { getTmdbPerson, getPersonMovies } from "../../../lib/api";
import CollectionLimitGrid from "../../../components/collection-limit-grid";
import RefreshOnEngineChange from "../../../components/refresh-on-engine-change";
import { Metadata } from "next";

type PersonPageProps = {
  params: {
    id: string;
  };
  searchParams: {
    name?: string;
  };
};

export async function generateMetadata({ params, searchParams }: PersonPageProps): Promise<Metadata> {
  const name = searchParams.name || "Person";
  return {
    title: `${name} - Movies`,
  };
}

export default async function PersonPage({ params, searchParams }: PersonPageProps) {
  const personId = Number(params.id);
  const name = searchParams.name || "";

  // Fetch person details from TMDB and their movies from our DB in parallel
  const [person, movies] = await Promise.all([
    getTmdbPerson(personId).catch(() => null),
    name ? getPersonMovies(name).catch(() => []) : Promise.resolve([])
  ]);

  const displayName = person?.name || name || "Unknown Person";
  const biography = person?.biography || "No biography available.";
  const profileUrl = person?.profile_path ? `https://image.tmdb.org/t/p/w500${person.profile_path}` : null;

  return (
    <div className="page-transition">
      <RefreshOnEngineChange />
      
      <div className="hero-banner" style={{ height: 'auto', minHeight: '400px', paddingBottom: '60px', paddingTop: '140px' }}>
        <div 
          className="hero-banner-bg" 
          style={{ 
            background: 'var(--bg-base)',
          }} 
        />
        <div className="hero-banner-gradient" style={{ background: 'linear-gradient(180deg, var(--bg-base) 0%, rgba(10,14,23,0) 50%, var(--bg-base) 100%)' }} />
        
        <div className="content-padding" style={{ width: '100%', display: 'flex', gap: '40px', alignItems: 'flex-end', flexWrap: 'wrap', position: 'relative', zIndex: 10 }}>
          <div style={{ 
            width: '280px', height: '420px', borderRadius: '16px', overflow: 'hidden', 
            backgroundColor: '#222', flexShrink: 0, boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            {profileUrl ? (
              <img 
                src={profileUrl} 
                alt={displayName}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#888', fontSize: '80px' }}>{displayName.charAt(0)}</span>
              </div>
            )}
          </div>
          
          <div style={{ flex: 1, minWidth: '300px', paddingBottom: '10px' }}>
            <h1 className="hero-title" style={{ margin: '0 0 16px 0', fontSize: '3.5rem' }}>{displayName}</h1>
            {person?.known_for_department && (
              <div className="hero-meta" style={{ marginBottom: '24px', fontSize: '1.05rem' }}>
                <span style={{ color: 'var(--brand)', fontWeight: 700 }}>{person.known_for_department}</span>
                {person.birthday && (
                  <>
                    <span style={{ opacity: 0.5 }}>•</span>
                    <span>Born: {person.birthday}</span>
                  </>
                )}
                {person.place_of_birth && (
                  <>
                    <span style={{ opacity: 0.5 }}>•</span>
                    <span>{person.place_of_birth}</span>
                  </>
                )}
              </div>
            )}
            <div 
              className="bio-scroll-container"
              style={{ 
                fontSize: '1.05rem', color: 'var(--text-subtle)', lineHeight: 1.7, 
                maxHeight: '280px', overflowY: 'auto', paddingRight: '20px',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0px, black 15px, black calc(100% - 15px), transparent 100%)',
                maskImage: 'linear-gradient(to bottom, transparent 0px, black 15px, black calc(100% - 15px), transparent 100%)',
                paddingTop: '15px',
                paddingBottom: '15px',
                marginTop: '-15px'
              }}
            >
              {biography.split('\n').map((paragraph: string, i: number) => (
                paragraph.trim() ? <p key={i} style={{ marginTop: 0, marginBottom: '14px' }}>{paragraph}</p> : null
              ))}
            </div>
          </div>
        </div>
      </div>

      <section className="content-padding" style={{ marginTop: '20px' }}>
        <CollectionLimitGrid
          settingKey={`person-${personId}`}
          title={`Movies with ${displayName}`}
          items={movies}
          emptyMessage="No movies found in the database for this person."
          rowMode={true}
        />
      </section>
    </div>
  );
}
