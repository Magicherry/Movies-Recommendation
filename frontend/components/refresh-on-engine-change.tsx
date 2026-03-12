"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function RefreshOnEngineChange() {
  const router = useRouter();
  const lastRefreshRef = useRef<string | null>(null);

  useEffect(() => {
    // Initialize on first mount without triggering refresh
    if (lastRefreshRef.current === null) {
      lastRefreshRef.current = localStorage.getItem("streamx-force-refresh");
    }

    const checkRefresh = () => {
      const current = localStorage.getItem("streamx-force-refresh");
      if (current !== lastRefreshRef.current) {
        lastRefreshRef.current = current;
        router.refresh();
      }
    };

    // Check immediately in case it changed while we were away
    checkRefresh();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'streamx-force-refresh') {
        checkRefresh();
      }
    };

    window.addEventListener('focus', checkRefresh);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('streamx-engine-changed', checkRefresh);

    return () => {
      window.removeEventListener('focus', checkRefresh);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('streamx-engine-changed', checkRefresh);
    };
  }, [router]);

  return null;
}
