"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Lock } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLoad } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import type { CardPayload } from "@/lib/types";
import { qrDefaults, qrPng } from "@/lib/qr";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { ErrorBox, PageHeader, PageLoader, Panel, PanelHeader, Segmented, ToggleRow } from "@/components/ui/misc";
import { CardView } from "@/components/card/card-view";
import { PhoneFrame } from "@/components/card/phone-frame";

type Settings = {
  name: string;
  slug: string;
  privacyPolicyUrl: string;
  contact: { email: string; phone: string; website: string; address: string; gstin: string };
  branding: { logoUrl: string; primaryColor: string; secondaryColor: string; description: string; tagline: string; social: Record<string, string>; qr: ReturnType<typeof qrDefaults> };
  cardSettings: { template: string; allowEmployeeTemplate: boolean; sections: Record<string, boolean>; employeeEditableFields: string[]; allowEmployeeLogin: boolean };
};

const TEMPLATES = [
  { id: "classic", name: "Classic", sub: "Safe for every brand" },
  { id: "modern", name: "Modern", sub: "Gradient cover" },
  { id: "executive", name: "Executive", sub: "Dark with gold" },
  { id: "minimal", name: "Minimal", sub: "Clean, text-first" },
];
const PRESETS = [
  ["#0E7490", "#F59E0B"],
  ["#1D4ED8", "#38BDF8"],
  ["#B91C1C", "#F97316"],
  ["#166534", "#A3E635"],
  ["#6D28D9", "#EC4899"],
  ["#0F172A", "#64748B"],
  ["#4F46E5", "#10B981"],
];
const SECTIONS: [string, string][] = [
  ["about", "About / bio"],
  ["contact", "Contact details"],
  ["social", "Social links"],
  ["products", "Products & services"],
  ["gallery", "Image gallery"],
  ["videos", "YouTube videos"],
  ["companyInfo", "Company information"],
  ["enquiry", "Enquiry form"],
  ["qr", "QR code"],
];
const FIELDS: [string, string][] = [
  ["photo", "Profile photo"],
  ["mobile", "Mobile number"],
  ["whatsapp", "WhatsApp number"],
  ["workEmail", "Email"],
  ["designation", "Designation"],
  ["department", "Department"],
  ["bio", "Short bio"],
  ["location", "Location"],
  ["website", "Website"],
  ["linkedin", "LinkedIn"],
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["youtube", "YouTube"],
  ["twitter", "X (Twitter)"],
];

function qrLuminance(hex: string) {
  const rgb = hex.slice(1).match(/.{2}/g)?.map((v) => parseInt(v, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) || [0, 0, 0];
  return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
}
function qrContrast(foreground: string, background: string) {
  const a = qrLuminance(foreground);
  const b = qrLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function QrPreview({ url, style }: { url: string; style: ReturnType<typeof qrDefaults> & { logoUrl?: string } }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    qrPng(url, style, 260).then(setSrc).catch(() => setSrc(""));
  }, [url, style]);
  return <div className="mt-3 flex min-h-40 items-center justify-center rounded-xl border border-line bg-surface p-3">{src && <img src={src} alt="QR code preview" className="size-40 object-contain" />}</div>;
}

export default function BrandingPage() {
  const { hasFeature, reload: reloadSession } = useAuth();
  const { data, error, loading, reload } = useLoad(async () => {
    const [settings, base] = await Promise.all([api.get<Settings>("/org/settings"), api.get<CardPayload>("/org/card-preview")]);
    return { settings, base };
  });
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  const logoRef = useRef<HTMLInputElement>(null);
  const custom = hasFeature("customBranding");

  useEffect(() => {
    if (data) setS({ ...data.settings, branding: { ...data.settings.branding, qr: qrDefaults(data.settings.branding.qr) } });
  }, [data]);

  const preview = useMemo<CardPayload | null>(() => {
    if (!data || !s) return null;
    const b = data.base;
    const sec = s.cardSettings.sections;
    return {
      ...b,
      template: (custom ? s.cardSettings.template : "classic") as CardPayload["template"],
      sections: {
        ...b.sections,
        ...sec,
        products: sec.products && b.content.products.length > 0,
        gallery: sec.gallery && b.content.gallery.length > 0,
        videos: sec.videos && b.content.videos.length > 0,
        enquiry: sec.enquiry && hasFeature("enquiryForm"),
      } as CardPayload["sections"],
      company: {
        ...b.company,
        name: s.name,
        privacyPolicyUrl: s.privacyPolicyUrl,
        logoUrl: custom ? s.branding.logoUrl : "",
        primaryColor: custom ? s.branding.primaryColor : "#4F46E5",
        secondaryColor: custom ? s.branding.secondaryColor : "#10B981",
        description: s.branding.description,
        tagline: s.branding.tagline,
        website: s.contact.website,
        email: s.contact.email,
        phone: s.contact.phone,
        address: s.contact.address,
        qr: custom ? { ...s.branding.qr, logoUrl: s.branding.logoUrl } : qrDefaults(),
      },
      social: { ...b.social, ...Object.fromEntries(Object.entries(s.branding.social || {}).filter(([, v]) => v)) },
    };
  }, [data, s, custom, hasFeature]);
  const qrPreviewStyle = useMemo(
    () => s ? { ...(custom ? s.branding.qr : qrDefaults()), logoUrl: custom ? s.branding.logoUrl : "", name: data?.base.employee.name } : qrDefaults(),
    [s, custom, data],
  );

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!s || !preview) return null;

  const setB = (patch: Partial<Settings["branding"]>) => setS({ ...s, branding: { ...s.branding, ...patch } });
  const setQr = (patch: Partial<Settings["branding"]["qr"]>) => setB({ qr: { ...s.branding.qr, ...patch } });
  const setC = (patch: Partial<Settings["contact"]>) => setS({ ...s, contact: { ...s.contact, ...patch } });
  const setCard = (patch: Partial<Settings["cardSettings"]>) => setS({ ...s, cardSettings: { ...s.cardSettings, ...patch } });

  async function save() {
    setBusy(true);
    try {
      const branding: Record<string, unknown> = { description: s!.branding.description, tagline: s!.branding.tagline, social: s!.branding.social };
      if (custom) Object.assign(branding, { primaryColor: s!.branding.primaryColor, secondaryColor: s!.branding.secondaryColor });
      if (custom) branding.qr = s!.branding.qr;
      await api.patch("/org/settings/company", { name: s!.name, privacyPolicyUrl: s!.privacyPolicyUrl, contact: s!.contact, branding });
      const card: Record<string, unknown> = {
        sections: s!.cardSettings.sections,
        employeeEditableFields: s!.cardSettings.employeeEditableFields,
        allowEmployeeLogin: s!.cardSettings.allowEmployeeLogin,
        allowEmployeeTemplate: s!.cardSettings.allowEmployeeTemplate,
      };
      if (custom) card.template = s!.cardSettings.template;
      await api.patch("/org/settings/card", card);
      toast.success("Saved. Every employee card now uses these settings.");
      reloadSession().catch(() => {});
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function uploadLogo(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const r = await api.upload<{ logoUrl: string }>("/org/settings/logo", file);
      setB({ logoUrl: r.logoUrl });
      toast.success("Logo updated on every card");
      reloadSession().catch(() => {});
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
      if (logoRef.current) logoRef.current.value = "";
    }
  }

  const locked = custom ? undefined : "Included with Custom branding — contact Beno to upgrade";

  return (
    <>
      <PageHeader
        eyebrow="Company Admin"
        title="Branding & card design"
        sub="Set these once. Logo, colours, company details and sections apply to every employee card automatically."
        actions={
          <>
            <div className="lg:hidden">
              <Segmented label="Edit or preview" value={pane} onChange={setPane} options={[{ value: "edit", label: "Edit" }, { value: "preview", label: "Preview" }]} />
            </div>
            <Button variant="primary" onClick={save} loading={busy}>
              Save changes
            </Button>
          </>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className={cn("flex flex-col gap-4", pane === "preview" && "max-lg:hidden")}>
          <Panel>
            <PanelHeader title="Logo & colours" sub={locked} />
            <div className={cn("flex flex-col gap-5 px-5 pb-5", !custom && "pointer-events-none opacity-50")}>
              <div className="flex items-center gap-4">
                <div className="grid h-16 w-28 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {s.branding.logoUrl ? <img src={s.branding.logoUrl} alt="Company logo" className="max-h-full max-w-full object-contain" /> : <span className="text-[12px] text-muted">No logo</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => uploadLogo(e.target.files?.[0])} />
                  <Button size="sm" onClick={() => logoRef.current?.click()} disabled={busy}>
                    <ImagePlus /> {s.branding.logoUrl ? "Replace logo" : "Upload logo"}
                  </Button>
                  {s.branding.logoUrl && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await api.del("/org/settings/logo").catch((e) => toast.error(errMsg(e)));
                        setB({ logoUrl: "" });
                      }}
                    >
                      Remove
                    </Button>
                  )}
                  <p className="w-full text-[12px] text-muted">PNG with transparent background works best. Max 5 MB.</p>
                </div>
              </div>
              <div>
                <div className="eyebrow mb-2">Colour presets</div>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map(([a, b]) => (
                    <button
                      key={a + b}
                      type="button"
                      aria-label={`Preset ${a} and ${b}`}
                      aria-pressed={s.branding.primaryColor.toUpperCase() === a && s.branding.secondaryColor.toUpperCase() === b}
                      onClick={() => setB({ primaryColor: a, secondaryColor: b })}
                      className="size-8 cursor-pointer rounded-full border-2 border-surface shadow-[0_0_0_1px_var(--line)] aria-pressed:shadow-[0_0_0_2px_var(--accent)]"
                      style={{ background: `linear-gradient(135deg, ${a} 50%, ${b} 50%)` }}
                    />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-4">
                  {(["primaryColor", "secondaryColor"] as const).map((k) => (
                    <label key={k} className="flex items-center gap-2 text-[12px] font-semibold text-muted">
                      {k === "primaryColor" ? "Primary" : "Secondary"}
                      <input type="color" value={s.branding[k]} onChange={(e) => setB({ [k]: e.target.value.toUpperCase() })} className="h-8 w-10 cursor-pointer rounded-lg border border-line bg-surface p-0.5" />
                      <code className="font-mono">{s.branding[k]}</code>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="eyebrow mb-2">Card design</div>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={s.cardSettings.template === t.id}
                      onClick={() => setCard({ template: t.id })}
                      className={cn("cursor-pointer rounded-xl border-2 border-line bg-surface p-2 text-left", s.cardSettings.template === t.id && "border-accent shadow-[0_0_0_3px_var(--accent-soft)]")}
                    >
                      <TemplateThumb id={t.id} a={s.branding.primaryColor} b={s.branding.secondaryColor} />
                      <b className="block text-[13px]">{t.name}</b>
                      <span className="text-[11px] text-muted">{t.sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className={cn("border-t border-line px-5 py-5", !custom && "pointer-events-none opacity-50")}>
              <PanelHeader title="QR style" sub="Branded QR codes use the card URL with the existing QR tracking parameter." />
              <QrPreview style={qrPreviewStyle} url={preview.url} />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {(["foreground", "background"] as const).map((key) => (
                  <label key={key} className="flex items-center gap-2 text-[12px] font-semibold text-muted">
                    {key === "foreground" ? "Foreground" : "Background"}
                    <input type="color" value={s.branding.qr[key]} onChange={(e) => setQr({ [key]: e.target.value.toUpperCase() })} className="h-8 w-10 cursor-pointer rounded-lg border border-line bg-surface p-0.5" />
                    <code className="font-mono">{s.branding.qr[key]}</code>
                  </label>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <ToggleRow title="Use company logo" checked={s.branding.qr.useLogo} onChange={(v) => setQr({ useLogo: v })} />
                <Segmented label="Frame" value={s.branding.qr.frame} onChange={(v) => setQr({ frame: v as "none" | "label" })} options={[{ value: "none", label: "None" }, { value: "label", label: "Label" }]} />
              </div>
              {s.branding.qr.frame === "label" && <Field label="Frame text" hint="Up to 40 characters"><Input maxLength={40} value={s.branding.qr.frameText} onChange={(e) => setQr({ frameText: e.target.value })} /></Field>}
              {(qrContrast(s.branding.qr.foreground, s.branding.qr.background) < 4.5 || qrLuminance(s.branding.qr.foreground) > qrLuminance(s.branding.qr.background)) && <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-[12px] font-semibold text-warn">These colours are too close; the QR code may not scan.</p>}
              <Button size="sm" variant="ghost" className="mt-3" onClick={() => setB({ qr: qrDefaults() })}>Reset QR style</Button>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Company details" sub="Shown in the company section of every card and in the saved contact." />
            <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
              <Field label="Company name" className="sm:col-span-2">
                <Input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
              </Field>
              <Field label="Tagline">
                <Input value={s.branding.tagline} maxLength={120} onChange={(e) => setB({ tagline: e.target.value })} placeholder="Engineering that saves energy" />
              </Field>
              <Field label="Website">
                <Input value={s.contact.website} onChange={(e) => setC({ website: e.target.value })} placeholder="www.company.com" />
              </Field>
              <Field label="Privacy policy URL (optional)" className="sm:col-span-2" hint="Use an HTTPS link. Visitors will see it below the enquiry consent checkbox.">
                <Input type="url" value={s.privacyPolicyUrl} onChange={(e) => setS({ ...s, privacyPolicyUrl: e.target.value })} placeholder="https://example.com/privacy" />
              </Field>
              <Field label="Company email">
                <Input type="email" value={s.contact.email} onChange={(e) => setC({ email: e.target.value })} />
              </Field>
              <Field label="Company phone">
                <Input value={s.contact.phone} onChange={(e) => setC({ phone: e.target.value })} />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <Textarea value={s.contact.address} onChange={(e) => setC({ address: e.target.value })} />
              </Field>
              <Field label="About the company" className="sm:col-span-2" hint={`${s.branding.description.length}/1000`}>
                <Textarea maxLength={1000} value={s.branding.description} onChange={(e) => setB({ description: e.target.value })} />
              </Field>
              {(["linkedin", "instagram", "facebook", "youtube", "twitter"] as const).map((k) => (
                <Field key={k} label={`Company ${k === "twitter" ? "X (Twitter)" : k[0]!.toUpperCase() + k.slice(1)}`}>
                  <Input value={s.branding.social?.[k] || ""} onChange={(e) => setB({ social: { ...s.branding.social, [k]: e.target.value } })} placeholder="https://..." />
                </Field>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Card sections" sub="Turn optional sections on or off for every card." />
            <div className="grid gap-2 px-5 pb-5 sm:grid-cols-2">
              {SECTIONS.map(([k, label]) => {
                const needs = ["products", "gallery", "videos"].includes(k) && !hasFeature("productsGallery") ? "Not in your plan" : k === "enquiry" && !hasFeature("enquiryForm") ? "Not in your plan" : undefined;
                return <ToggleRow key={k} title={label} checked={Boolean(s.cardSettings.sections[k])} onChange={(v) => setCard({ sections: { ...s.cardSettings.sections, [k]: v } })} locked={needs} />;
              })}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Employee access" sub="Decide what employees can change on their own card." />
            <div className="flex flex-col gap-4 px-5 pb-5">
              <div className="grid gap-2 sm:grid-cols-2">
                <ToggleRow
                  title="Allow employee login"
                  sub="Employees can log in to view and edit their card"
                  checked={s.cardSettings.allowEmployeeLogin}
                  onChange={(v) => setCard({ allowEmployeeLogin: v })}
                  locked={hasFeature("employeeLogin") ? undefined : "Not in your plan"}
                />
                <ToggleRow title="Per-employee design" sub="Admins can pick a different template per employee" checked={s.cardSettings.allowEmployeeTemplate} onChange={(v) => setCard({ allowEmployeeTemplate: v })} locked={locked ? "Not in your plan" : undefined} />
              </div>
              <div>
                <div className="eyebrow mb-2 flex items-center gap-1.5">
                  <Lock className="size-3.5" /> Fields employees may edit
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {FIELDS.map(([k, label]) => (
                    <Checkbox
                      key={k}
                      label={label}
                      checked={s.cardSettings.employeeEditableFields.includes(k)}
                      onChange={(e) => {
                        const set = new Set(s.cardSettings.employeeEditableFields);
                        if (e.target.checked) set.add(k);
                        else set.delete(k);
                        setCard({ employeeEditableFields: [...set] });
                      }}
                    />
                  ))}
                </div>
                <p className="mt-2 text-[12px] text-muted">Employees can never change their name, Employee ID, company, card status or other employees&apos; data.</p>
              </div>
            </div>
          </Panel>
        </div>
        <aside className={cn("flex flex-col gap-3 lg:sticky lg:top-20", pane === "edit" && "max-lg:hidden")}>
          <span className="eyebrow">Live preview · {data!.base.employee.name}</span>
          <PhoneFrame>
            <CardView card={preview} mode="preview" />
          </PhoneFrame>
          <p className="text-center text-[12px] text-muted">Changes appear here instantly. Click Save to publish them to every card.</p>
        </aside>
      </div>
    </>
  );
}

function TemplateThumb({ id, a, b }: { id: string; a: string; b: string }) {
  const dark = id === "executive";
  return (
    <div className="relative mb-1.5 h-16 overflow-hidden rounded-lg border border-line" style={{ background: dark ? "#14161C" : "#fff" }}>
      <div style={{ height: id === "minimal" ? 4 : 26, background: id === "modern" ? `linear-gradient(135deg, ${a}, ${a} 50%, ${b} 150%)` : dark ? "#0C0D11" : a }} />
      <div
        className="size-5"
        style={{
          borderRadius: id === "modern" ? 7 : id === "minimal" ? 6 : 999,
          background: `linear-gradient(135deg, ${a}, ${b})`,
          margin: id === "minimal" ? "8px 0 0 8px" : id === "modern" ? "-10px 0 0 8px" : "-10px auto 0",
          border: `2px solid ${dark ? "#C9A227" : "#fff"}`,
        }}
      />
      <div className="mt-1 h-1 w-[46%] rounded" style={{ background: dark ? "#C9A227" : "#CBD5E1", margin: id === "classic" || dark ? "5px auto 0" : "5px 8px 0" }} />
    </div>
  );
}
