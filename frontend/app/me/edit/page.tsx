"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Lock } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import type { CardPayload } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ErrorBox, PageHeader, PageLoader, Panel, Segmented } from "@/components/ui/misc";
import { CardView } from "@/components/card/card-view";
import { PhoneFrame } from "@/components/card/phone-frame";

type Me = {
  employee: { name: string; firstName: string; lastName: string; designation: string; department: string; workEmail: string; mobile: string; whatsapp: string; photoUrl: string; bio: string; location: string; website: string; social: Record<string, string> };
  editableFields: string[];
  card: CardPayload;
};

const FIELDS: { key: string; label: string; type?: string; textarea?: boolean; social?: boolean; hint?: string }[] = [
  { key: "designation", label: "Designation" },
  { key: "department", label: "Department" },
  { key: "mobile", label: "Mobile number", type: "tel" },
  { key: "whatsapp", label: "WhatsApp number", type: "tel" },
  { key: "workEmail", label: "Email", type: "email" },
  { key: "location", label: "Location" },
  { key: "website", label: "Website" },
  { key: "bio", label: "Short bio", textarea: true },
  { key: "linkedin", label: "LinkedIn", social: true },
  { key: "instagram", label: "Instagram", social: true },
  { key: "facebook", label: "Facebook", social: true },
  { key: "youtube", label: "YouTube", social: true },
  { key: "twitter", label: "X (Twitter)", social: true },
];

export default function EditMyCardPage() {
  const { data, error, loading, reload } = useLoad(() => api.get<Me>("/me/card"));
  const [v, setV] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!data) return;
    const e = data.employee;
    setV({
      designation: e.designation,
      department: e.department,
      mobile: e.mobile,
      whatsapp: e.whatsapp,
      workEmail: e.workEmail,
      location: e.location,
      website: e.website,
      bio: e.bio,
      ...Object.fromEntries(["linkedin", "instagram", "facebook", "youtube", "twitter"].map((k) => [k, e.social?.[k] || ""])),
    });
    setPhoto(e.photoUrl);
  }, [data]);

  const preview = useMemo<CardPayload | null>(() => {
    if (!data) return null;
    const c = data.card;
    return {
      ...c,
      employee: { ...c.employee, designation: v.designation ?? "", department: v.department ?? "", mobile: v.mobile ?? "", whatsapp: v.whatsapp || v.mobile || "", email: v.workEmail ?? "", location: v.location ?? "", website: v.website || c.company.website, bio: v.bio ?? "", photoUrl: photo },
      social: { ...c.social, ...Object.fromEntries(["linkedin", "instagram", "facebook", "youtube", "twitter"].map((k) => [k, v[k] || ""])) },
    };
  }, [data, v, photo]);

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data || !preview) return null;

  const allowed = new Set(data.editableFields);
  const editable = FIELDS.filter((f) => allowed.has(f.key));
  const lockedList = FIELDS.filter((f) => !allowed.has(f.key)).map((f) => f.label);

  async function save() {
    const body: Record<string, string> = {};
    for (const f of editable) body[f.key] = (v[f.key] || "").trim();
    setBusy(true);
    try {
      await api.patch("/me/card", body);
      toast.success("Saved. Your card link and QR code stay the same.");
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Photo must be 5 MB or smaller.");
    setBusy(true);
    try {
      const r = await api.upload<{ photoUrl: string }>("/me/card/photo", file);
      setPhoto(r.photoUrl);
      toast.success("Photo updated");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="My digital card"
        title="Edit my card"
        sub="Your company admin decides which details you can change."
        actions={
          <>
            <div className="lg:hidden">
              <Segmented label="Edit or preview" value={pane} onChange={setPane} options={[{ value: "edit", label: "Edit" }, { value: "preview", label: "Preview" }]} />
            </div>
            <Button variant="primary" onClick={save} loading={busy} disabled={editable.length === 0}>
              Save changes
            </Button>
          </>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className={cn("flex flex-col gap-4", pane === "preview" && "max-lg:hidden")}>
          {allowed.has("photo") && (
            <Panel className="flex items-center gap-4 p-5">
              <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 font-display text-2xl font-bold text-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {photo ? <img src={photo} alt="" className="size-full object-cover" /> : data.employee.firstName[0]}
              </div>
              <div className="flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
                <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                  <ImagePlus /> {photo ? "Change photo" : "Upload photo"}
                </Button>
                {photo && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await api.del("/me/card/photo").catch((e) => toast.error(errMsg(e)));
                      setPhoto("");
                    }}
                  >
                    Remove
                  </Button>
                )}
                <p className="w-full text-[12px] text-muted">A clear, front-facing photo. JPG, PNG or WEBP up to 5 MB.</p>
              </div>
            </Panel>
          )}
          <Panel className="p-5">
            <div className="mb-4">
              <div className="eyebrow">Name</div>
              <div className="font-semibold">{data.employee.name}</div>
            </div>
            {editable.length === 0 ? (
              <p className="text-muted">Your admin has not allowed any changes. Contact them to update your details.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {editable.map((f) => (
                  <Field key={f.key} label={f.label} htmlFor={`me-${f.key}`} className={f.textarea ? "sm:col-span-2" : undefined}>
                    {f.textarea ? (
                      <Textarea id={`me-${f.key}`} maxLength={600} value={v[f.key] || ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
                    ) : (
                      <Input id={`me-${f.key}`} type={f.type || "text"} value={v[f.key] || ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} placeholder={f.social ? "https://..." : undefined} />
                    )}
                  </Field>
                ))}
              </div>
            )}
            {lockedList.length > 0 && (
              <p className="mt-4 flex items-start gap-2 text-[12px] text-muted">
                <Lock className="mt-0.5 size-3.5 shrink-0" /> Managed by your admin: {lockedList.join(", ")}.
              </p>
            )}
          </Panel>
        </div>
        <aside className={cn("flex flex-col gap-3 lg:sticky lg:top-20", pane === "edit" && "max-lg:hidden")}>
          <span className="eyebrow">Live preview</span>
          <PhoneFrame>
            <CardView card={preview} mode="preview" />
          </PhoneFrame>
        </aside>
      </div>
    </>
  );
}
