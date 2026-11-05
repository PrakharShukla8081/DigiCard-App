"use client";

import { Download, Eye, MessageSquare, MousePointerClick, QrCode, Share2, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const stats = [
  { label: "Views", value: 1284 },
  { label: "Unique visitors", value: 642 },
  { label: "Contact saves", value: 218 },
  { label: "Enquiries", value: 37 },
];
const metrics = [
  ["Views", Eye],
  ["Unique visitors per day", Users],
  ["Shares", Share2],
  ["Contact saves", Download],
  ["QR visits", QrCode],
  ["Button taps", MousePointerClick],
  ["Enquiries", MessageSquare],
] as const;

export function AnalyticsDashboard() {
  const ref = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setStarted(true);
        observer.disconnect();
      }
    }, { threshold: 0.25 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className="space-y-5">
      <div className="flex items-center justify-between"><span className="eyebrow">Sample data</span><span className="text-xs text-muted">Last 14 days</span></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => <StatBox key={stat.label} {...stat} started={started} reduced={reduced} />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-2xl border border-line bg-bg p-4"><div className="flex items-center justify-between"><b className="text-sm">Activity trend</b><span className="text-xs text-muted">Sample data</span></div><svg viewBox="0 0 560 150" className="mt-4 h-40 w-full" role="img" aria-label="Sample fourteen day activity trend"><path d="M8 128H552M8 92H552M8 56H552M8 20H552" stroke="var(--line)" strokeWidth="1" /><polyline points="8,112 50,98 92,104 134,76 176,88 218,64 260,70 302,44 344,54 386,32 428,48 470,26 512,38 552,18" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><polyline points="8,128 8,112 50,98 92,104 134,76 176,88 218,64 260,70 302,44 344,54 386,32 428,48 470,26 512,38 552,18 552,128" fill="var(--accent)" opacity=".08" /></svg></div>
        <div className="rounded-2xl border border-line bg-bg p-4"><b className="text-sm">Top actions</b><div className="mt-4 space-y-4">{[["Call", 78], ["WhatsApp", 64], ["Email", 46], ["Website taps", 29]].map(([label, amount]) => <div key={label}><div className="mb-1 flex justify-between text-xs"><span>{label}</span><span className="tabular text-muted">{amount}%</span></div><div className="h-2 rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${amount}%` }} /></div></div>)}</div></div>
      </div>
      <div className="flex flex-wrap gap-2">{metrics.map(([label, Icon]) => <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1.5 text-xs font-semibold text-muted"><Icon className="size-3.5 text-accent" />{label}</span>)}</div>
    </div>
  );
}

function StatBox({ label, value, started, reduced }: { label: string; value: number; started: boolean; reduced: boolean }) {
  const [count, setCount] = useState(reduced ? value : 0);
  useEffect(() => {
    if (!started || reduced) {
      if (reduced) setCount(value);
      return;
    }
    const start = performance.now();
    const frame = (now: number) => {
      const progress = Math.min(1, (now - start) / 900);
      setCount(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, [started, reduced, value]);
  return <div className="rounded-xl border border-line bg-bg p-3"><div className="text-xs text-muted">{label}</div><div className="tabular mt-1 font-display text-2xl font-bold">{count.toLocaleString("en-IN")}</div></div>;
}
