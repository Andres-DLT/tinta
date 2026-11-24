import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { WakeCollabServer } from "@/components/wake-collab-server";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const serif = Source_Serif_4({ variable: "--font-serif-doc", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Tinta — notas colaborativas", template: "%s · Tinta" },
  description: "Edita documentos con tu equipo en tiempo real.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1014" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${inter.variable} ${serif.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <WakeCollabServer />
      </body>
    </html>
  );
}
