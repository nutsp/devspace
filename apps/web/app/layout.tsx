/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Script from "next/script";

// styles
// oxlint-disable-next-line import/no-unassigned-import -- Load the application stylesheet.
import "@/styles/globals.css";

import { createDevspaceMetadata, DEVSPACE_NAME } from "@/helpers/site-metadata";

// helpers
import { cn } from "@plane/utils";

// assets

// local
import { AppProvider } from "./provider";

export const meta = () => [
  ...createDevspaceMetadata(import.meta.env.VITE_WEB_BASE_URL || "http://localhost:8089"),
  {
    name: "viewport",
    content:
      "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
  },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const isSessionRecorderEnabled = parseInt(process.env.VITE_ENABLE_SESSION_RECORDER || "0");

  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#fff" />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href={`${import.meta.env.BASE_URL}brand/devspace-icon-v2-32.png`}
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href={`${import.meta.env.BASE_URL}brand/devspace-icon-v2-16.png`}
        />
        <link rel="manifest" href={`${import.meta.env.BASE_URL}site.webmanifest.json`} />
        <link rel="shortcut icon" href={`${import.meta.env.BASE_URL}brand/devspace-favicon-v2.ico`} />
        {/* Meta info for PWA */}
        <meta name="application-name" content={DEVSPACE_NAME} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content={DEVSPACE_NAME} />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href={`${import.meta.env.BASE_URL}brand/devspace-icon-v2-512.png`} />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href={`${import.meta.env.BASE_URL}brand/devspace-icon-v2-180.png`}
        />
        <link
          rel="apple-touch-icon"
          sizes="512x512"
          href={`${import.meta.env.BASE_URL}brand/devspace-icon-v2-512.png`}
        />
      </head>
      <body>
        <div id="context-menu-portal" />
        <div id="editor-portal" />
        <AppProvider>
          <div className={cn("relative flex h-screen w-full flex-col overflow-hidden", "app-container")}>
            <main className="relative h-full w-full overflow-hidden">{children}</main>
          </div>
        </AppProvider>
      </body>
      {!!isSessionRecorderEnabled && process.env.VITE_SESSION_RECORDER_KEY && (
        <Script id="clarity-tracking">
          {`(function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];if(y){y.parentNode.insertBefore(t,y);}
          })(window, document, "clarity", "script", "${process.env.VITE_SESSION_RECORDER_KEY}");`}
        </Script>
      )}
    </html>
  );
}
