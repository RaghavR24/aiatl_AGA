'use client'

import "~/styles/globals.css";

import { GeistSans } from "geist/font/sans";
import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";

import { TRPCReactProvider } from "~/trpc/react";

export default function RootLayout({
  children,
}: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable}`}>
      <body>
        <SessionProvider>
          <TRPCReactProvider>{children}</TRPCReactProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
