"use client";

import { useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/misc";
import { CardStatusMessage } from "@/components/card/card-status-message";
import { cardText, browserCardLanguage, type CardLanguage } from "@/lib/i18n/card";
import { useEffect } from "react";

export default function OfflinePage() {
  const [retrying, setRetrying] = useState(false);
  const [language, setLanguage] = useState<CardLanguage>("en");
  useEffect(() => {
    const preferred = browserCardLanguage();
    setLanguage(preferred);
    document.documentElement.lang = preferred;
  }, []);
  const t = () => cardText(language, "retry");
  return (
    <main className="page-pad grid min-h-dvh place-items-center py-10">
      <Panel className="w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-surface-2 text-muted">
          <WifiOff className="size-7" />
        </div>
        <CardStatusMessage kind="offline" />
        <Button
          className="mt-5"
          loading={retrying}
          onClick={() => {
            setRetrying(true);
            window.location.reload();
          }}
        >
          <RefreshCw /> {t()}
        </Button>
      </Panel>
    </main>
  );
}
