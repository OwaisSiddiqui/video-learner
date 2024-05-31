import "@/styles/globals.css";

import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata = {
  title: "Video Learner",
  description: "Learn by Video",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html className="h-full" lang="en">
      <body
        className={`flex h-full min-h-full w-screen flex-1 overflow-hidden ${inter.className} bg-white`}
      >
        {children}
      </body>
    </html>
  );
}
