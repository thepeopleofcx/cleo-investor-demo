import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cléo — CX",
  description: "Meet Cléo, the CX voice agent.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ background: "#000", margin: 0 }}>{children}</body>
    </html>
  );
}
