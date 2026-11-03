"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { fmtNum } from "@/lib/utils";
import type { CardPayload } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Chip, CopyField, ErrorBox, PageHeader, PageLoader, Panel, PanelHeader, Segmented } from "@/components/ui/misc";
import { CardView } from "@/components/card/card-view";
import { PhoneFrame } from "@/components/card/phone-frame";
import { QrBlock } from "@/components/card/qr-tools";
import { ShareKit } from "@/components/card/share-kit";
import { Legend, TrendChart } from "@/components/charts/trend";

type Me = { employee: { name: string; url: string; slug: string; employeeCode: string; cardStatus: string; isPublished: boolean; photoUrl: string }; editableFields: string[]; card: CardPayload };
type Stats = { totals: Record<string, number>; series: { day: string; views: number; shares: number; saves: number }[] };

const SERIES = [
  { key: "views", label: "Views", color: "var(--accent)", area: true },
  { key: "saves", label: "Contact saves", color: "var(--ok)" },
  { key: "shares", label: "Shares", color: "var(--warn)" },
];

export default function MyCardPage() {
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");
  const me = useLoad(() => api.get<Me>("/me/card"));
  const stats = useLoad(() => api.get<Stats>(`/me/stats?range=${range}`), [range]);
  if (me.loading && !me.data) return <PageLoader />;
  if (me.error) return <ErrorBox message={me.error} onRetry={me.reload} />;
  if (!me.data) return null;
  const { employee: e, card } = me.data;
  const live = e.cardStatus === "active" && e.isPublished;
  const t = stats.data?.totals || {};

  return (
    <>
      <PageHeader
        eyebrow={card.company.name}
        title={`Hi ${card.employee.firstName}`}
        sub="This is your digital visiting card. Share the link or QR code with customers."
        actions={
          <>
            <Button asChild>
              <a href={e.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Open my card
              </a>
            </Button>
            {me.data.editableFields.length > 0 && (
              <Button asChild variant="primary">
                <Link href="/me/edit">
                  <Pencil /> Edit my card
                </Link>
              </Button>
            )}
          </>
        }
      />
      {!live && <p className="mb-4 rounded-xl bg-warn-soft px-4 py-3 text-[13px] font-semibold text-warn">Your card is currently {e.cardStatus === "inactive" ? "inactive" : "unpublished"}, so visitors cannot open it. Ask your company admin to publish it.</p>}
      {!e.photoUrl && me.data.editableFields.includes("photo") && (
        <p className="mb-4 rounded-xl bg-accent-soft px-4 py-3 text-[13px] font-semibold text-accent">
          Tip: <Link href="/me/edit" className="underline">add a profile photo</Link> — customers remember a face.
        </p>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <Segmented
              label="Period"
              value={range}
              onChange={setRange}
              options={[
                { value: "7d", label: "7 days" },
                { value: "30d", label: "30 days" },
                { value: "90d", label: "90 days" },
              ]}
            />
            {live ? <Chip tone="ok">Card is live</Chip> : <Chip tone="warn">Not live</Chip>}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Views", t.view],
              ["Contact saves", t.vcard_download],
              ["Shares", t.share],
              ["Enquiries", t.enquiry],
            ].map(([l, v]) => (
              <Panel key={l as string} className="p-4">
                <div className="eyebrow">{l}</div>
                <div className="tabular mt-1 font-display text-[26px] font-bold">{fmtNum(v as number)}</div>
              </Panel>
            ))}
          </div>
          <Panel>
            <PanelHeader title="Your card activity" actions={<Legend series={SERIES} />} />
            <div className="px-3 pb-3">
              <TrendChart data={stats.data?.series || []} series={SERIES} height={220} />
            </div>
          </Panel>
          <ShareKit card={card} />
          <Panel className="p-5">
            <div className="grid items-center gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
              <QrBlock url={e.url} fileName={e.slug} size={150} />
              <div className="flex min-w-0 flex-col gap-2">
                <div className="eyebrow">Your permanent card link</div>
                <CopyField value={e.url} />
                <p className="text-[12px] text-muted">The link and QR code never change, even when you update your details. Print the QR on your physical card or desk stand.</p>
              </div>
            </div>
          </Panel>
        </div>
        <aside className="flex flex-col gap-3 lg:sticky lg:top-20">
          <span className="eyebrow">Your card</span>
          <PhoneFrame>
            <CardView card={card} mode="preview" />
          </PhoneFrame>
        </aside>
      </div>
    </>
  );
}
