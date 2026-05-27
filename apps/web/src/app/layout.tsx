import type { ReactNode } from "react";

export const metadata = {
  title: "tent",
  description: "self-hosted deployment control plane",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#0a0908",
          color: "#e6e3df",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        {children}
      </body>
    </html>
  );
}
