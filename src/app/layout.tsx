import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "CloudArcade — играй в свои игры в браузере",
  description:
    "Загружайте свои игровые ROM-файлы и играйте прямо в браузере через WebAssembly-эмуляцию. Устанавливается на Android и iOS как приложение.",
  manifest: "/manifest.webmanifest",
  applicationName: "CloudArcade",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CloudArcade",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1020",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <ServiceWorkerRegister />
        <Header />
        {children}
      </body>
    </html>
  );
}
