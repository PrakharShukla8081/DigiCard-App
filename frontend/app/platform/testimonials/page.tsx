"use client";

import { useState } from "react";
import { MessageSquareQuote, Plus, Trash2 } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { Chip, Dialog, Empty, ErrorBox, PageHeader, PageLoader, Panel, Table, Td, Th, ToggleRow, useConfirm } from "@/components/ui/misc";

type Testimonial = { _id: string; name: string; role: string; company: string; quote: string; rating: number | null; consentConfirmed: boolean; isPublished: boolean; sortOrder: number };
type FormState = { name: string; role: string; company: string; quote: string; rating: string; consentConfirmed: boolean; isPublished: boolean; sortOrder: string };
const empty: FormState = { name: "", role: "", company: "", quote: "", rating: "", consentConfirmed: false, isPublished: false, sortOrder: "0" };

export default function TestimonialsPage() {
  const { data, error, loading, reload } = useLoad(() => api.get<Testimonial[]>("/platform/testimonials"));
  const [selected, setSelected] = useState<Testimonial | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const open = (item?: Testimonial) => {
    setSelected(item || null);
    setDialogOpen(true);
    setForm(item ? { name: item.name, role: item.role, company: item.company, quote: item.quote, rating: item.rating ? String(item.rating) : "", consentConfirmed: item.consentConfirmed, isPublished: item.isPublished, sortOrder: String(item.sortOrder) } : empty);
  };
  const set = (key: keyof FormState, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  async function save() {
    setSaving(true);
    try {
      const body = { ...form, rating: form.rating ? Number(form.rating) : null, sortOrder: Number(form.sortOrder) };
      if (selected) await api.patch(`/platform/testimonials/${selected._id}`, body);
      else await api.post("/platform/testimonials", body);
      setSelected(null); setDialogOpen(false); await reload();
    } catch (e) { alert(errMsg(e)); } finally { setSaving(false); }
  }
  async function remove(item: Testimonial) {
    if (!(await confirm({ title: "Delete testimonial?", body: "This permanently removes the testimonial.", confirmLabel: "Delete", danger: true }))) return;
    try { await api.del(`/platform/testimonials/${item._id}`); await reload(); } catch (e) { alert(errMsg(e)); }
  }
  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  return <><PageHeader eyebrow="Super Admin" title="Testimonials" sub="Only reviews with confirmed written permission can be published." actions={<Button variant="primary" onClick={() => open()}><Plus /> Add testimonial</Button>} /><Panel>{!data?.length ? <Empty icon={<MessageSquareQuote />} title="No testimonials yet" sub="Add a client review after receiving written permission." /> : <Table><thead><tr><Th>Client</Th><Th>Quote</Th><Th>Rating</Th><Th>Status</Th><Th /></tr></thead><tbody>{data.map((item) => <tr key={item._id}><Td><b>{item.name}</b><span className="block text-xs text-muted">{[item.role, item.company].filter(Boolean).join(" · ")}</span></Td><Td className="max-w-md"><span className="line-clamp-2">{item.quote}</span></Td><Td>{item.rating ? `${item.rating}/5` : "—"}</Td><Td><Chip tone={item.isPublished ? "ok" : "muted"}>{item.isPublished ? "Published" : "Draft"}</Chip></Td><Td><div className="flex justify-end gap-2"><Button size="sm" onClick={() => open(item)}>Edit</Button><Button size="icon-sm" variant="danger-outline" aria-label={`Delete ${item.name}`} onClick={() => remove(item)}><Trash2 /></Button></div></Td></tr>)}</tbody></Table>}</Panel><Dialog open={dialogOpen} onOpenChange={(value) => { setDialogOpen(value); if (!value) setSelected(null); }} title={selected ? "Edit testimonial" : "Add testimonial"} sub="Client permission is required before publishing." wide><div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Name *"><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></Field><Field label="Company *"><Input value={form.company} onChange={(e) => set("company", e.target.value)} /></Field><Field label="Role"><Input value={form.role} onChange={(e) => set("role", e.target.value)} /></Field><Field label="Rating"><Input type="number" min="1" max="5" value={form.rating} onChange={(e) => set("rating", e.target.value)} /></Field></div><Field label="Quote *" hint="20–500 characters"><Textarea value={form.quote} onChange={(e) => set("quote", e.target.value)} /></Field><Field label="Sort order"><Input type="number" min="0" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} /></Field><Checkbox label="I confirm this client gave written permission to publish this review with their name and company." checked={form.consentConfirmed} onChange={(e) => set("consentConfirmed", e.target.checked)} /><ToggleRow title="Publish on website" sub={form.consentConfirmed ? "Visible on the public homepage." : "Confirm written permission first."} checked={form.isPublished} onChange={(value) => set("isPublished", value)} disabled={!form.consentConfirmed} /><div className="flex justify-end gap-2 border-t border-line pt-4"><Button onClick={() => setDialogOpen(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={save}>Save testimonial</Button></div></div></Dialog></>;
}
