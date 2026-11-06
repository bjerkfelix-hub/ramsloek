import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "Nesodden Ramsløk",
};

// Temporary minimal root layout for the public site (replaced in a later task).
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb">
      <body>{children}</body>
    </html>
  );
}
