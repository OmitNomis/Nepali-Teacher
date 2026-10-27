import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ToastProvider } from "./components/ui";
import { ApiError } from "./lib/api";
import "./styles.css";

// The session expired or was revoked while the app stayed open (`me` is never
// refetched): go back to the login screen instead of failing every request.
const onError = (err: Error) => {
  if (err instanceof ApiError && err.status === 401 && queryClient.getQueryData(["me"])) {
    queryClient.clear();
    queryClient.setQueryData(["me"], null);
  }
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
