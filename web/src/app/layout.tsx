import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Revit Licensing Dashboard",
  description: "Manage your internal Revit plugin licenses securely.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
