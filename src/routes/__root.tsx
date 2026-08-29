import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
  useRouter,
} from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { DatasetProvider } from "@/store/dataset-context";
import { ThemeProvider } from "@/store/theme-context";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="neo p-10 max-w-md text-center">
        <h1 className="text-7xl font-bold gradient-text">404</h1>
        <p className="mt-4 text-muted-foreground">This page doesn't exist.</p>
        <Link to="/" className="mt-6 inline-block neo-btn px-5 py-2.5 font-semibold">
          Go home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const isHttpError = error?.message === "HTTPError" || error?.message?.includes("HTTPError");
  const displayMsg = isHttpError
    ? "A backend service or RPC call was unreachable or unconfigured."
    : error?.message || "An unexpected error occurred.";

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="neo p-10 max-w-md text-center">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{displayMsg}</p>
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => {
              try {
                localStorage.removeItem("dataiq.dashboard.layout.v1");
              } catch {
                /* ignore */
              }
              router.invalidate();
              reset();
            }}
            className="w-full sm:w-auto neo-btn px-4 py-2.5 text-xs font-bold text-primary"
          >
            Reset layout & Retry
          </button>
          <Link
            to="/"
            onClick={() => reset()}
            className="w-full sm:w-auto neo-btn px-4 py-2.5 text-xs font-bold"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        httpEquiv: "Content-Security-Policy",
        content:
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; connect-src 'self' ws: wss: https:; font-src 'self' data: https://fonts.gstatic.com;",
      },
      { title: "DataIQ Pro — Dataset Analysis for Data & AI Professionals" },
      {
        name: "description",
        content:
          "Production-grade dataset analysis platform with role-aware AI insights, statistics, correlation, outliers, code generation and chat.",
      },
      { property: "og:title", content: "DataIQ Pro" },
      {
        property: "og:description",
        content: "Role-aware dataset analysis for analysts, scientists, and engineers.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  const themeBootstrap = `(function(){try{var t=localStorage.getItem('dataiq.theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}document.documentElement.style.colorScheme=t;}catch(e){}})();`;
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <ThemeProvider>
      <DatasetProvider>
        <AppShell>
          <Outlet />
        </AppShell>
        <Toaster position="top-right" richColors theme="system" />
      </DatasetProvider>
    </ThemeProvider>
  );
}
