import type { Metadata } from "next";
import { Geist, Geist_Mono, ZCOOL_QingKe_HuangYou } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "./components/ServiceWorkerRegister";
import LayerStack from "./components/LayerStack";
import ClientProviders from "./ClientProviders";
import ToastContainer from "./components/Toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const zcoolDisplay = ZCOOL_QingKe_HuangYou({
  weight: "400",
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "腾昇智和 · 短视频智能体展示与调用",
  description:
    "腾昇智和短视频智能体交互演示：输入需求，调用智能体生成视频/图片素材并在页面展示结果。",
  applicationName: "腾昇智和",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
  },
};

export const viewport = {
  themeColor: "#070b12",
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
      className={`${geistSans.variable} ${geistMono.variable} ${zcoolDisplay.variable} h-full antialiased`}
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
