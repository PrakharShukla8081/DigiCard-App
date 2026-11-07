"use client";

import { useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/misc";

export default function OfflinePage() {
  const [retrying, setRetrying] = useState(false);
  return (
    <main className="page-pad grid min-h-dvh place-items-center py-10">
      <Panel className="w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-surface-2 text-muted">
          <WifiOff className="size-7" />
        </div>
        <h1 className="text-2xl font-bold">You&apos;re offline</h1>
        <p className="mt-2 text-muted">Check your internet connection and try again.</p>
        <Button
          className="mt-5"
          loading={retrying}
          onClick={() => {
            setRetrying(true);
            window.location.reload();
          }}
        >
          <RefreshCw /> Retry
        </Button>
      </Panel>
    </main>
  );
}
