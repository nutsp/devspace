/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import Script from "next/script";
import { Links, Meta, Outlet, Scripts } from "react-router";
import type { LinksFunction } from "react-router";
import { ThemeProvider, useTheme } from "next-themes";
// plane imports
import { createDevspaceMetadata, DEVSPACE_NAME } from "@/helpers/site-metadata";
import { cn } from "@plane/utils";
// types
// assets
import globalStyles from "@/styles/globals.css?url";
import type { Route } from "./+types/root";
// components
import { LogoSpinner } from "@/components/common/logo-spinner";
// lib
import { isStaleAssetError, recoverFromStaleAsset } from "@/lib/stale-asset-error";
// local
import { CustomErrorComponent } from "./error";
import { AppProvider } from "./provider";
// fonts
// oxlint-disable-next-line import/no-unassigned-import -- Load the application font styles.
import "@fontsource-variable/inter";
import interVariableWoff2 from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
// oxlint-disable-next-line import/no-unassigned-import -- Load the application font styles.
import "@fontsource/material-symbols-rounded";
// oxlint-disable-next-line import/no-unassigned-import -- Load the application font styles.
import "@fontsource/ibm-plex-mono";

export const links: LinksFunction = () => [
  { rel: "icon", type: "image/png", sizes: "32x32", href: `${import.meta.env.BASE_URL}brand/devspace-icon-v1-32.png` },
  { rel: "icon", type: "image/png", sizes: "16x16", href: `${import.meta.env.BASE_URL}brand/devspace-icon-v1-16.png` },
  { rel: "shortcut icon", href: `${import.meta.env.BASE_URL}brand/devspace-favicon-v1.ico` },
  { rel: "manifest", href: `${import.meta.env.BASE_URL}site.webmanifest.json` },
  { rel: "apple-touch-icon", href: `${import.meta.env.BASE_URL}brand/devspace-icon-v1-512.png` },
  { rel: "apple-touch-icon", sizes: "180x180", href: `${import.meta.env.BASE_URL}brand/devspace-icon-v1-180.png` },
  { rel: "apple-touch-icon", sizes: "512x512", href: `${import.meta.env.BASE_URL}brand/devspace-icon-v1-512.png` },
  { rel: "stylesheet", href: globalStyles },
  {
    rel: "preload",
    href: interVariableWoff2,
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  },
];

export function Layout({ children }: { children: ReactNode }) {
  const isSessionRecorderEnabled = parseInt(process.env.VITE_ENABLE_SESSION_RECORDER || "0");

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#fff" />
        {/* Meta info for PWA */}
        <meta name="application-name" content={DEVSPACE_NAME} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content={DEVSPACE_NAME} />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <Meta />
        <Links />
      </head>
      <body suppressHydrationWarning>
        <div id="context-menu-portal" />
        <div id="editor-portal" />
        <ThemeProvider themes={["light", "dark", "light-contrast", "dark-contrast", "custom"]} defaultTheme="system">
          {children}
        </ThemeProvider>
        <Scripts />
        {!!isSessionRecorderEnabled && process.env.VITE_SESSION_RECORDER_KEY && (
          <Script id="clarity-tracking">
            {`(function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];if(y){y.parentNode.insertBefore(t,y);}
          })(window, document, "clarity", "script", "${process.env.VITE_SESSION_RECORDER_KEY}");`}
          </Script>
        )}
      </body>
    </html>
  );
}

export const meta: Route.MetaFunction = () =>
  createDevspaceMetadata(import.meta.env.VITE_WEB_BASE_URL || "http://localhost:8089");

export default function Root() {
  return (
    <AppProvider>
      <div className={cn("relative flex h-screen w-full flex-col overflow-hidden bg-canvas", "desktop-app-container")}>
        <main className="relative h-full w-full overflow-hidden">
          <Outlet />
        </main>
      </div>
    </AppProvider>
  );
}

export function HydrateFallback() {
  const { resolvedTheme } = useTheme();

  // if we are on the server or the theme is not resolved, return an empty div
  if (typeof window === "undefined" || resolvedTheme === undefined) return <div />;

  return (
    <div className="relative flex h-screen w-full items-center justify-center bg-canvas">
      <LogoSpinner />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  // A stale chunk failure surfaces here as React Router's own wrapper error
  // (the failed dynamic import itself never reaches a window event) — recover
  // the same way entry.client.tsx does instead of just showing the error page.
  if (import.meta.env.PROD && isStaleAssetError(error)) recoverFromStaleAsset();

  return <CustomErrorComponent error={error} />;
}
