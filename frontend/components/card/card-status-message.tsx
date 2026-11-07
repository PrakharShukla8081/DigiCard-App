"use client";

import { useEffect, useState } from "react";
import { cardText, browserCardLanguage, type CardLanguage } from "@/lib/i18n/card";

export function CardStatusMessage({ kind }: { kind: "offline" | "expired" | "notFound" }) {
  const [language, setLanguage] = useState<CardLanguage>("en");
  useEffect(() => {
    const preferred = browserCardLanguage();
    setLanguage(preferred);
    document.documentElement.lang = preferred;
  }, []);
  const titleKey = kind === "offline" ? "offlineTitle" : kind === "expired" ? "expiredTitle" : "notFoundTitle";
  const bodyKey = kind === "offline" ? "offlineBody" : kind === "expired" ? "expiredBody" : "notFoundBody";
  const languageClass = language === "hi" ? "card-status-hi" : "";
  return (
    <>
      <h1 className={`text-2xl font-bold ${languageClass}`}>{cardText(language, titleKey)}</h1>
      <p className={`mt-2 text-muted ${languageClass}`}>{cardText(language, bodyKey)}</p>
    </>
  );
}
