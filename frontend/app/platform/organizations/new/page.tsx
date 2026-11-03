"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import type { Invite, Plan } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ErrorBox, InviteResult, PageHeader, PageLoader, Panel, PanelHeader } from "@/components/ui/misc";
import { SubscriptionFields, emptySub, subBody, type SubForm } from "@/components/platform/subscription-form";

const slugify = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export default function NewOrganizationPage() {
  const { data, error, reload } = useLoad(async () => {
    const [plans, meta] = await Promise.all([api.get<Plan[]>("/platform/plans"), api.get<{ features: Record<string, string> }>("/platform/meta")]);
    return { plans, features: meta.features };
  });
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [contact, setContact] = useState({ email: "", phone: "", website: "", address: "", gstin: "" });
  const [admin, setAdmin] = useState({ name: "", email: "" });
  const [sub, setSub] = useState<SubForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; invite: Invite; email: string } | null>(null);

  useEffect(() => {
    if (data && !sub) setSub(emptySub(data.plans));
  }, [data, sub]);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data || !sub) return <PageLoader />;

  if (!data.plans.length)
    return (
      <>
        <PageHeader title="New company" />
        <Panel className="p-6">
          <p className="font-semibold">Create a plan first.</p>
          <p className="mt-1 text-muted">Every company needs a subscription plan. Add one in Plans, then come back.</p>
          <Button asChild variant="primary" className="mt-4">
            <Link href="/platform/plans">Go to Plans</Link>
          </Button>
        </Panel>
      </>
    );

  if (created)
    return (
      <>
        <PageHeader title="Company created" sub={`${name} is ready. The company admin must accept the invite to log in.`} />
        <Panel className="flex max-w-2xl flex-col gap-4 p-5">
          <InviteResult invite={created.invite} email={created.email} />
          <div className="flex gap-2">
            <Button asChild variant="primary">
              <Link href={`/platform/organizations/${created.id}`}>Open company</Link>
            </Button>
            <Button asChild>
              <Link href="/platform/organizations">All companies</Link>
            </Button>
          </div>
        </Panel>
      </>
    );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const contactBody = Object.fromEntries(Object.entries(contact).filter(([, v]) => v.trim()));
      const res = await api.post<{ organization: { _id: string }; invite: Invite }>("/platform/organizations", {
        name: name.trim(),
        ...(slugTouched && slug ? { slug } : {}),
        contact: contactBody,
        admin: { name: admin.name.trim(), email: admin.email.trim() },
        subscription: subBody(sub!),
      });
      toast.success("Company created");
      setCreated({ id: res.data.organization._id, invite: res.data.invite, email: admin.email.trim() });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Link href="/platform/organizations" className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Companies
      </Link>
      <PageHeader
        title="New company"
        sub="Creates the company account, assigns its subscription and invites the first company admin by email."
        actions={
          <Button type="submit" variant="primary" loading={busy}>
            Create company
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Company" />
          <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
            <Field label="Company name" htmlFor="o-name" className="sm:col-span-2">
              <Input
                id="o-name"
                required
                minLength={2}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
                placeholder="ABC Industries Pvt Ltd"
              />
            </Field>
            <Field label="Card URL name" htmlFor="o-slug" className="sm:col-span-2" hint={`Cards will live at /c/${slug || "company-name"}/employee-name. Changing it later breaks printed QR codes.`}>
              <Input id="o-slug" value={slug} pattern="[a-z0-9\-]{2,60}" onChange={(e) => (setSlug(slugify(e.target.value)), setSlugTouched(true))} />
            </Field>
            <Field label="Company email" htmlFor="o-email">
              <Input id="o-email" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
            </Field>
            <Field label="Phone" htmlFor="o-phone">
              <Input id="o-phone" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
            </Field>
            <Field label="Website" htmlFor="o-web">
              <Input id="o-web" value={contact.website} onChange={(e) => setContact({ ...contact, website: e.target.value })} placeholder="www.company.com" />
            </Field>
            <Field label="GSTIN" htmlFor="o-gst">
              <Input id="o-gst" value={contact.gstin} onChange={(e) => setContact({ ...contact, gstin: e.target.value })} />
            </Field>
            <Field label="Address" htmlFor="o-addr" className="sm:col-span-2">
              <Textarea id="o-addr" value={contact.address} onChange={(e) => setContact({ ...contact, address: e.target.value })} />
            </Field>
          </div>
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHeader title="First company admin" sub="Receives an email invite to set a password." />
            <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
              <Field label="Full name" htmlFor="a-name">
                <Input id="a-name" required minLength={2} value={admin.name} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} />
              </Field>
              <Field label="Email" htmlFor="a-email">
                <Input id="a-email" type="email" required value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} />
              </Field>
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Subscription" sub="Assigned manually until a payment gateway is connected." />
            <div className="px-5 pb-5">
              <SubscriptionFields value={sub} onChange={setSub} plans={data.plans} features={data.features} />
            </div>
          </Panel>
        </div>
      </div>
    </form>
  );
}
