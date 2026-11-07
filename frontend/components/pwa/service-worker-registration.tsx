"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    let reloaded = false;
    const showUpdate = (worker: ServiceWorker) => {
      toast("New version available", {
        duration: Infinity,
        action: {
          label: "Reload",
          onClick: () => worker.postMessage({ type: "SKIP_WAITING" }),
        },
      });
    };

    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) showUpdate(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) showUpdate(installing);
          });
        });
      })
      .catch((error: unknown) => console.error("Service worker registration failed:", error));

    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  return null;
}
