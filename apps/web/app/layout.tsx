import type { Metadata } from "next";
import "./globals.css";
import { translations } from "@/lib/i18n";

export const metadata: Metadata = {
  title: translations.common.metaTitle,
  description: translations.common.metaDescription,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}