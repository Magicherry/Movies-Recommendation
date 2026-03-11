"use client";

import { useUser } from "../context/user-context";

export default function UserProfileActions({ profileUserId }: { profileUserId: number }) {
  const { userId, setUserId } = useUser();
  const isCurrentUser = userId === profileUserId;

  if (isCurrentUser) {
    return (
      <div style={{
        background: "rgba(106, 225, 0, 0.1)",
        color: "var(--brand)",
        padding: "8px 16px",
        borderRadius: "99px",
        fontSize: "0.9rem",
        fontWeight: 600,
        border: "1px solid rgba(106, 225, 0, 0.2)",
        display: "flex",
        alignItems: "center",
        gap: "6px"
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5"></path>
        </svg>
        Current User
      </div>
    );
  }

  return (
    <button
      onClick={() => setUserId(profileUserId)}
      className="btn-primary"
      style={{
        padding: "10px 20px",
        fontSize: "0.95rem",
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="8.5" cy="7" r="4"></circle>
        <polyline points="17 11 19 13 23 9"></polyline>
      </svg>
      Switch to this User
    </button>
  );
}
