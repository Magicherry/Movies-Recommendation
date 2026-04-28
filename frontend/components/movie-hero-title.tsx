"use client";

import { useEffect, useState } from "react";

type Props = {
  logoUrl?: string;
  movieName: string;
};

function useShowMovieLogos(): boolean {
  const [show, setShow] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("streamx-show-movie-logos") !== "false";
  });
  useEffect(() => {
    const handler = () => setShow(localStorage.getItem("streamx-show-movie-logos") !== "false");
    window.addEventListener("streamx-settings-changed", handler);
    return () => window.removeEventListener("streamx-settings-changed", handler);
  }, []);
  return show;
}

export default function MovieHeroTitle({ logoUrl, movieName }: Props) {
  const showLogos = useShowMovieLogos();

  if (showLogos && logoUrl) {
    return <img className="hero-movie-logo" src={logoUrl} alt={`${movieName} logo`} />;
  }
  return <h1 className="hero-title" style={{ margin: 0 }}>{movieName}</h1>;
}
