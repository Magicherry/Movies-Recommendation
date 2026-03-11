import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Suspense } from "react";
import AppNavbar from "../components/navbar";
import { UserProvider } from "../context/user-context";
import ScrollToTop from "../components/scroll-to-top";

export const metadata: Metadata = {
  title: "StreamX | Personalized Movie Recommendations",
  description: "Discover your next favorite movie with StreamX, powered by advanced Matrix Factorization.",
  icons: {
    icon: "/icon.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <UserProvider>
          <Suspense fallback={null}>
            <AppNavbar />
          </Suspense>
          <main className="page-container">
            {children}
          </main>
          <ScrollToTop />
        </UserProvider>
      </body>
    </html>
  );
}
