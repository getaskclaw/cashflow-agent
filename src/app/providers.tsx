"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "react-hot-toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: "#1e1e2e",
            color: "#e8e8ed",
            border: "1px solid #2a2a3a",
          },
        }}
      />
    </SessionProvider>
  );
}
