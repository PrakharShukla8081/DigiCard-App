"use client";

import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { useRef } from "react";

type Testimonial = { name: string; role: string; company: string; quote: string; rating: number | null };
export function Testimonials({ items }: { items: Testimonial[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (direction: number) => ref.current?.scrollBy({ left: direction * 360, behavior: "smooth" });
  if (!items.length) return null;
  return <section className="page-pad mx-auto max-w-7xl py-20"><div className="flex items-end justify-between gap-4"><div><div className="eyebrow">What clients say</div><h2 className="mt-3 text-3xl font-bold sm:text-4xl">Words from teams using Beno Card.</h2></div>{items.length > 3 && <div className="flex gap-2"><button type="button" className="rounded-full border border-line p-2 hover:bg-surface-2" onClick={() => scroll(-1)} aria-label="Previous testimonial"><ChevronLeft className="size-4" /></button><button type="button" className="rounded-full border border-line p-2 hover:bg-surface-2" onClick={() => scroll(1)} aria-label="Next testimonial"><ChevronRight className="size-4" /></button></div>}</div><div ref={ref} className={`mt-8 grid gap-4 ${items.length > 3 ? "auto-cols-[minmax(280px,360px)] grid-flow-col overflow-x-auto snap-x snap-mandatory pb-3" : "sm:grid-cols-2 lg:grid-cols-3"}`}>{items.map((item) => <article key={`${item.name}-${item.company}`} className="rounded-2xl border border-line bg-surface p-6 shadow-soft snap-start"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-full bg-accent-soft font-bold text-accent">{item.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</div><div><b className="block">{item.name}</b><span className="text-xs text-muted">{[item.role, item.company].filter(Boolean).join(" · ")}</span></div></div><p className="mt-5 text-[15px] leading-7 text-fg">&ldquo;{item.quote}&rdquo;</p>{item.rating && <div className="mt-4 flex gap-0.5 text-warn" aria-label={`${item.rating} out of 5 stars`}>{Array.from({ length: item.rating }, (_, index) => <Star key={index} className="size-4 fill-current" />)}</div>}</article>)}</div></section>;
}
