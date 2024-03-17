import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PCD <> TG",
  description: "Generated by create next app"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
