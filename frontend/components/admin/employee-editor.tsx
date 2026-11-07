"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, ImagePlus, Trash2 } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtNum, timeAgo } from "@/lib/utils";
import type { CardPayload, Employee, Invite } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Chip, CopyField, Dialog, InviteResult, PageHeader, Panel, PanelHeader, Segmented, ToggleRow, useConfirm } from "@/components/ui/misc";
import { CardView } from "@/components/card/card-view";
import { PhoneFrame } from "@/components/card/phone-frame";
import { QrBlock } from "@/components/card/qr-tools";
import { NfcLinkPanel } from "@/components/card/nfc-link-panel";

type Form = {
  employeeCode: string;
  firstName: string;
  lastName: string;
  designation: string;
  department: string;
  location: string;
  bio: string;
  mobile: string;
  whatsapp: string;
  workEmail: string;
  website: string;
  linkedin: string;
  instagram: string;
  facebook: string;
  youtube: string;
  twitter: string;
  template: string;
  cardStatus: "active" | "inactive";
  isPublished: boolean;
  hideFromDirectory: boolean;
  slug: string;
};

const fromEmployee = (e?: Employee): Form => ({
  employeeCode: e?.employeeCode || "",
  firstName: e?.firstName || "",
  lastName: e?.lastName || "",
  designation: e?.designation || "",
  department: e?.department || "",
  location: e?.location || "",
  bio: e?.bio || "",
  mobile: e?.mobile || "",
  whatsapp: e?.whatsapp || "",
  workEmail: e?.workEmail || "",
  website: e?.website || "",
  linkedin: e?.social?.linkedin || "",
  instagram: e?.social?.instagram || "",
  facebook: e?.social?.facebook || "",
  youtube: e?.social?.youtube || "",
  twitter: e?.social?.twitter || "",
  template: e?.template || "",
  cardStatus: e?.cardStatus || "active",
  isPublished: e?.isPublished ?? true,
  hideFromDirectory: e?.hideFromDirectory ?? false,
  slug: e?.slug || "",
});

const toBody = (f: Form, isNew: boolean, original?: Employee) => {
  const body: Record<string, unknown> = {
    employeeCode: f.employeeCode.trim(),
    firstName: f.firstName.trim(),
    lastName: f.lastName.trim(),
    designation: f.designation.trim(),
    department: f.department.trim(),
    location: f.location.trim(),
    bio: f.bio.trim(),
    mobile: f.mobile.trim(),
    whatsapp: f.whatsapp.trim(),
    workEmail: f.workEmail.trim(),
    website: f.website.trim(),
    social: { linkedin: f.linkedin.trim(), instagram: f.instagram.trim(), facebook: f.facebook.trim(), youtube: f.youtube.trim(), twitter: f.twitter.trim() },
    template: f.template,
    cardStatus: f.cardStatus,
    isPublished: f.isPublished,
    hideFromDirectory: f.hideFromDirectory,
  };
  if (!isNew && f.slug && f.slug !== original?.slug) body.slug = f.slug;
  return body;
};

const TEMPLATES = [
  { value: "", label: "Company default" },
  { value: "classic", label: "Classic" },
  { value: "modern", label: "Modern" },
  { value: "executive", label: "Executive" },
  { value: "minimal", label: "Minimal" },
];

export function EmployeeEditor({ employee, base, onSaved }: { employee?: Employee; base: CardPayload; onSaved?: () => void }) {
  const isNew = !employee;
  const router = useRouter();
  const confirm = useConfirm();
  const { hasFeature, session } = useAuth();
  const [f, setF] = useState<Form>(fromEmployee(employee));
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  const [busy, setBusy] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(employee?.photoUrl || "");
  const [invite, setInvite] = useState<Invite | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));
  const customBranding = hasFeature("customBranding");

  const preview: CardPayload = useMemo(
    () => ({
      ...base,
      template: (customBranding && f.template ? f.template : base.template) as CardPayload["template"],
      employee: {
        ...base.employee,
        name: [f.firstName, f.lastName].filter(Boolean).join(" ") || "New employee",
        firstName: f.firstName,
        designation: f.designation,
        department: f.department,
        email: f.workEmail,
        mobile: f.mobile,
        whatsapp: f.whatsapp || f.mobile,
        photoUrl,
        bio: f.bio,
        location: f.location,
        website: f.website || base.company.website,
      },
      // Preview shows the employee's own links; on the live card, empty ones fall back to company links.
      social: {
        linkedin: f.linkedin,
        instagram: f.instagram,
        facebook: f.facebook,
        youtube: f.youtube,
        twitter: f.twitter,
      },
    }),
    [base, f, photoUrl, customBranding]
  );

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!f.employeeCode.trim() || !f.firstName.trim()) return toast.error("Employee ID and first name are required.");
    if (!isNew && f.slug !== employee!.slug) {
      const ok = await confirm({ title: "Change the card address?", body: "The old link and every printed or shared QR code for this employee will stop working.", confirmLabel: "Change address", danger: true });
      if (!ok) return;
    }
    setBusy(true);
    try {
      if (isNew) {
        const created = (await api.post<Employee>("/org/employees", toBody(f, true))).data;
        toast.success("Employee added. Their card is ready.");
        router.replace(`/admin/employees/${created._id}`);
      } else {
        await api.patch(`/org/employees/${employee!._id}`, toBody(f, false, employee));
        toast.success("Saved. The card link stays the same.");
        onSaved?.();
      }
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(file?: File) {
    if (!file || !employee) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Photo must be 5 MB or smaller.");
    setBusy(true);
    try {
      const r = await api.upload<{ photoUrl: string }>(`/org/employees/${employee._id}/photo`, file);
      setPhotoUrl(r.photoUrl);
      toast.success("Photo updated");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const loginOn = hasFeature("employeeLogin");

  return (
    <div>
      <Link href="/admin/employees" className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Employees
      </Link>
      <PageHeader
        eyebrow={isNew ? "New employee" : `${employee!.employeeCode}`}
        title={isNew ? "Add employee" : employee!.name}
        sub={isNew ? "Fill in the details. The card and QR code are created as soon as you save." : `Added ${fmtDate(employee!.createdAt)} · last engagement ${timeAgo(employee!.lastEngagementAt)}`}
        actions={
          <>
            <div className="lg:hidden">
              <Segmented
                label="Edit or preview"
                value={pane}
                onChange={setPane}
                options={[
                  { value: "edit", label: "Edit" },
                  { value: "preview", label: "Preview" },
                ]}
              />
            </div>
            <Button type="submit" form="employee-editor-form" variant="primary" loading={busy}>
              {isNew ? "Create card" : "Save changes"}
            </Button>
          </>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <form id="employee-editor-form" onSubmit={save} className={pane === "preview" ? "max-lg:hidden" : ""}>
          <Panel>
            <section className="border-b border-line px-5 py-5">
              <h2 className="mb-4 text-base font-bold">Profile</h2>
              {!isNew && (
                <div className="mb-4 flex items-center gap-4">
                  <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 font-bold text-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {photoUrl ? <img src={photoUrl} alt="" className="size-full object-cover" /> : preview.employee.name.slice(0, 1)}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => uploadPhoto(e.target.files?.[0])} />
                    <Button type="button" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                      <ImagePlus /> {photoUrl ? "Change photo" : "Upload photo"}
                    </Button>
                    {photoUrl && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await api.del(`/org/employees/${employee!._id}/photo`).catch((e) => toast.error(errMsg(e)));
                          setPhotoUrl("");
                        }}
                      >
                        Remove
                      </Button>
                    )}
                    <p className="w-full text-[12px] text-muted">JPG, PNG or WEBP, up to 5 MB. Square photos look best.</p>
                  </div>
                </div>
              )}
              {isNew && <p className="mb-4 text-[13px] text-muted">You can upload a photo right after creating the card.</p>}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Employee ID *" htmlFor="f-code" hint="Unique inside your company">
                  <Input id="f-code" required value={f.employeeCode} onChange={(e) => set({ employeeCode: e.target.value })} />
                </Field>
                <Field label="Department" htmlFor="f-dept">
                  <Input id="f-dept" value={f.department} onChange={(e) => set({ department: e.target.value })} />
                </Field>
                <Field label="First name *" htmlFor="f-first">
                  <Input id="f-first" required value={f.firstName} onChange={(e) => set({ firstName: e.target.value })} />
                </Field>
                <Field label="Last name" htmlFor="f-last">
                  <Input id="f-last" value={f.lastName} onChange={(e) => set({ lastName: e.target.value })} />
                </Field>
                <Field label="Designation" htmlFor="f-desig">
                  <Input id="f-desig" value={f.designation} onChange={(e) => set({ designation: e.target.value })} />
                </Field>
                <Field label="Location" htmlFor="f-loc">
                  <Input id="f-loc" value={f.location} onChange={(e) => set({ location: e.target.value })} placeholder="City, State" />
                </Field>
                <Field label="Short bio" htmlFor="f-bio" className="sm:col-span-2" hint={`${f.bio.length}/600`}>
                  <Textarea id="f-bio" maxLength={600} value={f.bio} onChange={(e) => set({ bio: e.target.value })} />
                </Field>
              </div>
            </section>
            <section className="border-b border-line px-5 py-5">
              <h2 className="mb-4 text-base font-bold">Contact</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Mobile number" htmlFor="f-mob">
                  <Input id="f-mob" inputMode="tel" value={f.mobile} onChange={(e) => set({ mobile: e.target.value })} placeholder="+91 98765 43210" />
                </Field>
                <Field label="WhatsApp number" htmlFor="f-wa" hint="Leave empty to use the mobile number">
                  <Input id="f-wa" inputMode="tel" value={f.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} />
                </Field>
                <Field label="Work email" htmlFor="f-email" hint={loginOn ? "Also used for the employee's login" : undefined}>
                  <Input id="f-email" type="email" value={f.workEmail} onChange={(e) => set({ workEmail: e.target.value })} />
                </Field>
                <Field label="Website" htmlFor="f-web" hint="Empty = company website">
                  <Input id="f-web" value={f.website} onChange={(e) => set({ website: e.target.value })} placeholder={base.company.website} />
                </Field>
              </div>
            </section>
            <section className="border-b border-line px-5 py-5">
              <h2 className="mb-1 text-base font-bold">Social links</h2>
              <p className="mb-4 text-[13px] text-muted">Empty links fall back to the company&apos;s social links.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {(["linkedin", "instagram", "facebook", "youtube", "twitter"] as const).map((k) => (
                  <Field key={k} label={k === "twitter" ? "X (Twitter)" : k[0]!.toUpperCase() + k.slice(1)} htmlFor={`f-${k}`}>
                    <Input id={`f-${k}`} value={f[k]} onChange={(e) => set({ [k]: e.target.value } as Partial<Form>)} placeholder={`https://${k === "twitter" ? "x" : k}.com/...`} />
                  </Field>
                ))}
              </div>
            </section>
            <section className="px-5 py-5">
              <h2 className="mb-4 text-base font-bold">Card settings</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <ToggleRow title="Published" sub="Visible at its public link" checked={f.isPublished} onChange={(v) => set({ isPublished: v })} />
                <ToggleRow title="Card active" sub="Inactive cards are hidden and excluded from reminders" checked={f.cardStatus === "active"} onChange={(v) => set({ cardStatus: v ? "active" : "inactive" })} />
                <ToggleRow title="Hide from company directory" sub="Employee will not appear in the company directory" checked={f.hideFromDirectory} onChange={(v) => set({ hideFromDirectory: v })} />
                <Field label="Card design" htmlFor="f-tpl" hint={customBranding ? undefined : "Templates need Custom branding in your plan"}>
                  <Select id="f-tpl" value={f.template} disabled={!customBranding} onChange={(e) => set({ template: e.target.value })}>
                    {TEMPLATES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                {!isNew && (
                  <Field label="Card address" htmlFor="f-slug" hint={`/c/${session?.organization?.slug}/${f.slug}`}>
                    <Input id="f-slug" value={f.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} />
                  </Field>
                )}
              </div>
            </section>
          </Panel>

          {!isNew && (
            <Panel className="mt-4">
              <PanelHeader title="Danger zone" />
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-5">
                <p className="text-[13px] text-muted">Deleting removes the card, link, QR code and the employee&apos;s login. Analytics totals stay in reports.</p>
                <Button
                  type="button"
                  variant="danger-outline"
                  onClick={async () => {
                    if (!(await confirm({ title: `Delete ${employee!.name}?`, body: "This cannot be undone.", confirmLabel: "Delete employee", danger: true }))) return;
                    try {
                      await api.del(`/org/employees/${employee!._id}`);
                      toast.success("Employee deleted");
                      router.replace("/admin/employees");
                    } catch (e) {
                      toast.error(errMsg(e));
                    }
                  }}
                >
                  <Trash2 /> Delete employee
                </Button>
              </div>
            </Panel>
          )}
        </form>

        <aside className={`flex flex-col gap-4 lg:sticky lg:top-20 ${pane === "edit" ? "max-lg:hidden" : ""}`}>
          {!isNew && <NfcLinkPanel link={`${employee!.url}?src=nfc`} />}
          <div className="flex items-center justify-between">
            <span className="eyebrow">Live preview</span>
            {!isNew && (f.cardStatus === "inactive" ? <Chip tone="bad">Inactive</Chip> : f.isPublished ? <Chip tone="ok">Live</Chip> : <Chip tone="warn">Unpublished</Chip>)}
          </div>
          <PhoneFrame>
            <CardView card={preview} mode="preview" />
          </PhoneFrame>
          {!isNew && (
            <>
              <CopyField value={employee!.url} label="Copy link" />
              <div className="flex gap-2">
                <Button asChild className="flex-1">
                  <a href={employee!.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink /> Open card
                  </a>
                </Button>
              </div>
              <Panel className="p-4">
                <QrBlock url={employee!.url} fileName={employee!.slug} size={160} style={employee?.qr} name={employee!.name} />
              </Panel>
              <Panel className="p-4">
                <div className="eyebrow mb-2">Card activity (all time)</div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    ["Views", employee!.stats?.views],
                    ["Shares", employee!.stats?.shares],
                    ["Saves", employee!.stats?.saves],
                    ["Enquiries", employee!.stats?.enquiries],
                  ].map(([l, v]) => (
                    <div key={l as string}>
                      <div className="tabular font-display text-lg font-bold">{fmtNum(v as number)}</div>
                      <div className="text-[11px] text-muted">{l}</div>
                    </div>
                  ))}
                </div>
              </Panel>
              {loginOn && <LoginPanel employee={employee!} onInvite={setInvite} onChange={onSaved} />}
            </>
          )}
        </aside>
      </div>
      <Dialog open={Boolean(invite)} onOpenChange={(o) => !o && setInvite(null)} title="Login invite" footer={<Button variant="primary" onClick={() => setInvite(null)}>Done</Button>}>
        {invite && <InviteResult invite={invite} email={employee?.workEmail || ""} />}
      </Dialog>
    </div>
  );
}

function LoginPanel({ employee, onInvite, onChange }: { employee: Employee; onInvite: (i: Invite) => void; onChange?: () => void }) {
  const [busy, setBusy] = useState(false);
  const l = employee.login;
  async function invite() {
    setBusy(true);
    try {
      const r = await api.post<{ invite: Invite }>(`/org/employees/${employee._id}/invite`);
      onInvite(r.data.invite);
      onChange?.();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function setStatus(status: "active" | "disabled") {
    setBusy(true);
    try {
      await api.post(`/org/employees/${employee._id}/login-status`, { status });
      toast.success(status === "active" ? "Login enabled" : "Login disabled");
      onChange?.();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="eyebrow">Employee login</span>
        {l?.status === "active" ? <Chip tone="ok">Active</Chip> : l?.status === "invited" ? <Chip tone="warn">Invited</Chip> : l?.status === "disabled" ? <Chip tone="bad">Disabled</Chip> : <Chip>None</Chip>}
      </div>
      <p className="mb-3 text-[13px] text-muted">
        {l?.status === "active"
          ? `Last login ${timeAgo(l.lastLoginAt)}. The employee can edit the fields you allow in Branding & card design.`
          : l?.status === "invited"
            ? `Invite sent ${timeAgo(l.invitedAt)}. It expires after 7 days.`
            : "Invite the employee to manage their own card, photo and contact details."}
      </p>
      <div className="flex flex-wrap gap-2">
        {(!l || l.status === "invited") && (
          <Button type="button" size="sm" variant="primary" onClick={invite} loading={busy} disabled={!employee.workEmail}>
            {l ? "Resend invite" : "Send login invite"}
          </Button>
        )}
        {l?.status === "active" && (
          <Button type="button" size="sm" variant="danger-outline" onClick={() => setStatus("disabled")} loading={busy}>
            Disable login
          </Button>
        )}
        {l?.status === "disabled" && (
          <Button type="button" size="sm" onClick={() => setStatus("active")} loading={busy}>
            Enable login
          </Button>
        )}
      </div>
      {!employee.workEmail && <p className="mt-2 text-[12px] text-warn">Add a work email first.</p>}
    </Panel>
  );
}
