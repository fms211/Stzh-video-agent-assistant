import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./typography.css";
import "./rounding.css";
import "./studio-context-ui.css";
import "./squish-switch.css";
import "./coze-dialogue.css";
import ServiceWorkerRegister from "./components/ServiceWorkerRegister";
import LayerStack from "./components/LayerStack";
import ClientProviders from "./ClientProviders";
import ToastContainer from "./components/Toast";

const geistSans = localFont({
  src: "../public/fonts/Geist-100.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "../public/fonts/GeistMono-100.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

const displayFont = localFont({
  src: "../public/fonts/FusionPixel-12px-proportional-zh_hans.woff2",
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Stzh·video agent assistant · 1.40",
  description:
    "AI视频创作工作台：连接模型与Coze、组织角色与工作流、管理项目记忆和创作结果。",
  applicationName: "腾昇智和",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        type: "image/png",
        sizes: "180x180",
      },
    ],
  },
};

export const viewport = {
  themeColor: "#050A14",
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} ${displayFont.variable} h-full antialiased`}
    >
      <body className="relative isolate min-h-full flex flex-col bg-background text-foreground font-sans">
        <ServiceWorkerRegister />
        <ClientProviders>
          <LayerStack>{children}</LayerStack>
          <ToastContainer />
        </ClientProviders>
      </body>
    </html>
  );
}
