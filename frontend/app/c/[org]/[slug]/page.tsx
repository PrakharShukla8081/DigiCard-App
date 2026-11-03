import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CardPayload } from "@/lib/types";
import { PublicCard } from "./public-card";

const BACKEND = (process.env.BACKEND_URL || "http://localhost:5000").replace(/\/+$/, "");
const SLUG = /^[a-z0-9-]{1,80}$/;

type Params = { org: string; slug: string };

async function loadCard(org: string, slug: string): Promise<{ card: CardPayload | null; unavailable: boolean }> {
  if (!SLUG.test(org) || !SLUG.test(slug)) return { card: null, unavailable: false };
  try {
    const res = await fetch(`${BACKEND}/api/public/cards/${org}/${slug}`, {
      headers: process.env.INTERNAL_API_KEY ? { "x-internal-key": process.env.INTERNAL_API_KEY } : {},
      next: { revalidate: 30 },
    });
    if (res.status === 404) {
      const j = await res.json().catch(() => ({}));
      return { card: null, unavailable: j.code === "CARD_UNAVAILABLE" };
    }
    if (!res.ok) throw new Error(`Card API returned ${res.status}`);
    const j = await res.json();
    return { card: j.data as CardPayload, unavailable: false };
  } catch {
    return { card: null, unavailable: true };
  }
}

const abs = (u: string) => (!u ? undefined : /^https?:\/\//.test(u) ? u : `${process.env.NEXT_PUBLIC_APP_URL || ""}${u}`);

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { org, slug } = await params;
  const { card } = await loadCard(org, slug);
  if (!card) return { title: "Card not available", robots: { index: false } };
  const e = card.employee;
  const title = `${e.name}${e.designation ? ` — ${e.designation}` : ""} | ${card.company.name}`;
  const description = e.bio || `Digital visiting card of ${e.name}, ${card.company.name}. Call, WhatsApp, email or save the contact.`;
  const image = abs(e.photoUrl) || abs(card.company.logoUrl);
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, type: "profile", url: card.url, ...(image ? { images: [{ url: image }] } : {}) },
    twitter: { card: "summary", title, description },
    robots: { index: false, follow: false }, // employee cards are shared directly, not indexed
  };
}

export default async function CardPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { org, slug } = await params;
  const sp = await searchParams;
  const { card, unavailable } = await loadCard(org, slug);
  if (!card) {
    if (unavailable)
      return (
        <main className="grid min-h-dvh place-items-center px-6 text-center">
          <div>
            <h1 className="text-2xl font-bold">This card is not available right now</h1>
            <p className="mt-2 text-muted">The card may be paused by its company. Please try again later or contact the person directly.</p>
          </div>
        </main>
      );
    notFound();
  }
  const src = typeof sp.src === "string" ? sp.src : "direct";
  return <PublicCard card={card} source={src} />;
}
