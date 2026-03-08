import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import AppNavbar from "../components/navbar";

export const metadata: Metadata = {
  title: "Option 1 Movie Recommender",
  description: "CS550 Option 1 recommender system demo"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <AppNavbar />
        <main className="page-container">
          {children}
        </main>
      </body>
    </html>
  );
}
