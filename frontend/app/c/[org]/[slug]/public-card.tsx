"use client";

import { useEffect, useRef, useState } from "react";
import type { CardPayload } from "@/lib/types";
import { CardView } from "@/components/card/card-view";
import { QrBlock } from "@/components/card/qr-tools";
import { cardLanguageStorageKey, cardText, type CardLanguage } from "@/lib/i18n/card";

const SOURCES = ["qr", "link", "direct", "nfc", "email", "whatsapp"];

/** Sends a measurable event. Uses sendBeacon so it survives navigation (tel:, wa.me, vCard). */
function beacon(body: Record<string, string>) {
  const data = JSON.stringify(body);
  try {
    if (navigator.sendBeacon && navigator.sendBeacon("/api/public/events", new Blob([data], { type: "application/json" }))) return;
  } catch {
    /* fall back to fetch */
  }
  fetch("/api/public/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: data, keepalive: true }).catch(() => {});
}

export function PublicCard({ card, source }: { card: CardPayload; source: string }) {
  const src = SOURCES.includes(source) ? source : "direct";
  const sent = useRef(false);
  const [language, setLanguage] = useState<CardLanguage>(card.company.cardLanguage || "en");
  const base = { orgSlug: card.orgSlug, slug: card.slug, source: src };

  useEffect(() => {
    let preferred = card.company.cardLanguage || "en";
    try {
      const stored = localStorage.getItem(cardLanguageStorageKey(card.orgSlug));
      if (stored === "en" || stored === "hi") preferred = stored;
    } catch {
      // Use the server-selected language when local storage is unavailable.
    }
    setLanguage(preferred);
    document.documentElement.lang = preferred;
  }, [card.company.cardLanguage, card.orgSlug]);

  function changeLanguage(next: CardLanguage) {
    setLanguage(next);
    document.documentElement.lang = next;
    try {
      localStorage.setItem(cardLanguageStorageKey(card.orgSlug), next);
    } catch {
      // The selected language remains active for this page view.
    }
  }

  const t = (key: Parameters<typeof cardText>[1], values?: Record<string, string>) => cardText(language, key, values);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    beacon({ ...base, type: "view" });
    // Keep source attribution in this visit, but avoid carrying it into links re-shared from the page.
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-dvh bg-[#e9ecf3] sm:py-8">
      <div className="mx-auto grid max-w-[860px] items-start gap-6 sm:px-4 md:grid-cols-[minmax(0,440px)_minmax(0,300px)] md:justify-center">
        <div className="overflow-hidden bg-white sm:rounded-[28px] sm:shadow-[0_20px_50px_rgba(15,23,42,0.18)]">
          <CardView card={card} mode="public" source={src} language={language} onLanguageChange={changeLanguage} onTrack={(type, meta) => beacon({ ...base, type, ...(meta ? { meta } : {}) })} />
        </div>
        <aside className="sticky top-8 hidden flex-col gap-4 md:flex">
          <div className="rounded-3xl bg-white p-6 text-center text-[#0F172A] shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
            <div className="text-[11px] font-bold tracking-[0.08em] text-[#5B6475] uppercase">{t("openOnPhone")}</div>
            <div className="mt-3">
              <QrBlock url={card.url} fileName={card.slug} size={190} style={{ ...card.company.qr, logoUrl: card.company.logoUrl }} name={card.employee.name} />
            </div>
            <p className="mt-3 text-[12px] text-[#5B6475]">{t("scanWithCamera", { name: card.employee.firstName })}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
