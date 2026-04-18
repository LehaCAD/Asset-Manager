"use client";

import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const ComponentInspector =
  process.env.NODE_ENV === "development"
    ? dynamic(() => import("@/components/dev/ComponentInspector"), {
        ssr: false,
      })
    : () => null;

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  );

  // Toasts: top-center on mobile (thumbs cover bottom), bottom-center on desktop.
  // Offset on mobile pushes toasts below the 48 px sticky navbar.
  const [toastPosition, setToastPosition] =
    useState<"bottom-center" | "top-center">("bottom-center");
  const [toastOffset, setToastOffset] = useState<string>("24px");
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)");
    const apply = () => {
      setToastPosition(mql.matches ? "top-center" : "bottom-center");
      setToastOffset(mql.matches ? "64px" : "24px");
    };
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange={false}
      >
        <TooltipProvider delayDuration={300}>
          {children}
          <ComponentInspector />
          <Toaster
            richColors
            position={toastPosition}
            offset={toastOffset}
            visibleToasts={2}
            toastOptions={{
              duration: 3000,
            }}
          />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
