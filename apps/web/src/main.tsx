import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";
import "./lib/theme";

const client = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, networkMode: "offlineFirst" } },
});

registerSW({
  immediate: true,
  onRegisterError(error) {
    console.error("[PWA] Service worker registration failed:", error);
  },
  onRegistered(registration) {
    if (registration) {
      registration.update().catch(() => undefined);
      window.setInterval(() => registration.update().catch(() => undefined), 60 * 60 * 1000);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "activated" && navigator.serviceWorker.controller) {
            window.location.reload();
          }
        });
      });
    }
  },
  onNeedRefresh() {
    window.location.reload();
  },
  onOfflineReady() {
    console.info("[PWA] Ready for offline use");
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
