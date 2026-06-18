import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { csrfHeaders } from "@/lib/csrf";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import {
  PropertyProvider,
  getStoredPropertyId,
} from "./contexts/PropertyContext";
// Self-hosted fonts (bundled — do not rely on the Google Fonts CDN at runtime).
import "@fontsource-variable/inter/wght.css";
import "@fontsource/heebo/400.css";
import "@fontsource/heebo/500.css";
import "@fontsource/heebo/600.css";
import "@fontsource/heebo/700.css";
import "./index.css";
import "./lib/i18n";

// Privacy analytics (umami) — injected only when configured. Avoids requesting a
// literal "%VITE_ANALYTICS_ENDPOINT%/umami" URL (an undecodable path that the
// server logs as a URIError on every page load) when the env vars are unset.
const analyticsEndpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
const analyticsWebsiteId = import.meta.env.VITE_ANALYTICS_WEBSITE_ID;
if (analyticsEndpoint && analyticsWebsiteId) {
  const script = document.createElement("script");
  script.defer = true;
  script.src = `${analyticsEndpoint}/umami`;
  script.setAttribute("data-website-id", analyticsWebsiteId);
  document.head.appendChild(script);
}

// Active tenant header, read fresh from localStorage on every request so a
// future tenant switcher takes effect without a page reload. Omitted when no
// tenant has been selected — the server then uses the user's default tenant.
function tenantHeader(): Record<string, string> {
  const id = localStorage.getItem("hv_active_tenant_id");
  return id ? { "x-tenant-id": id } : {};
}

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;
  if (error.message === UNAUTHED_ERR_MSG) window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    redirectToLoginIfUnauthorized(event.query.state.error);
    console.error("[API Query Error]", event.query.state.error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    redirectToLoginIfUnauthorized(event.mutation.state.error);
    console.error("[API Mutation Error]", event.mutation.state.error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      // Use a path relative to the current origin/path so it works under HA ingress
      url: "api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
          headers: {
            ...(init?.headers ?? {}),
            // Read from localStorage on every fetch so that switchProperty()
            // takes effect immediately without requiring a page reload first.
            "x-property-id": String(getStoredPropertyId()),
            // Active tenant/workspace. Only sent when one has been selected;
            // otherwise the server falls back to the user's default tenant.
            // Mirrors x-property-id so switching takes effect without a reload.
            ...tenantHeader(),
            // CSRF double-submit — sends the server-set cookie value as a
            // header on every tRPC call. State-changing routes verify it.
            ...csrfHeaders(),
          },
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <PropertyProvider>
        <App />
      </PropertyProvider>
    </QueryClientProvider>
  </trpc.Provider>
);
