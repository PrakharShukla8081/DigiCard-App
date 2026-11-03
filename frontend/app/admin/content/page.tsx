"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ImagePlus, Images, Package, Plus, Trash2, Video } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLoad } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Dialog, Empty, ErrorBox, PageHeader, PageLoader, Panel, PanelHeader, Segmented, Switch, useConfirm } from "@/components/ui/misc";

type Item = { _id: string; kind: "product" | "gallery" | "video"; title: string; description: string; imageUrl: string; url: string; youtubeId: string; sortOrder: number; isActive: boolean };
type Kind = Item["kind"];

const LABEL: Record<Kind, { title: string; one: string; icon: typeof Package; help: string }> = {
  product: { title: "Products & services", one: "product", icon: Package, help: "Shown as tiles with an optional photo and link." },
  gallery: { title: "Gallery", one: "image", icon: Images, help: "Photos of your office, plant, events or work." },
  video: { title: "Videos", one: "video", icon: Video, help: "Paste YouTube links. Visitors open them on YouTube." },
};

export default function ContentPage() {
  const { hasFeature } = useAuth();
  const confirm = useConfirm();
  const [kind, setKind] = useState<Kind>("product");
  const { data, error, loading, reload } = useLoad(() => api.get<Item[]>("/org/content"));
  const [edit, setEdit] = useState<{ id?: string; title: string; description: string; url: string; file?: File | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!hasFeature("productsGallery"))
    return (
      <>
        <PageHeader title="Products, gallery & videos" />
        <Panel>
          <Empty icon={<Package />} title="Not included in your plan" sub="Contact Beno to add products, gallery and video sections to your cards." />
        </Panel>
      </>
    );
  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  const items = (data || []).filter((i) => i.kind === kind).sort((a, b) => a.sortOrder - b.sortOrder);
  const L = LABEL[kind];

  async function save() {
    if (!edit) return;
    setBusy(true);
    try {
      let id = edit.id;
      const body = { title: edit.title.trim(), description: edit.description.trim(), url: edit.url.trim() };
      if (id) await api.patch(`/org/content/${id}`, body);
      else id = (await api.post<Item>("/org/content", { kind, ...body })).data._id;
      if (edit.file) await api.upload(`/org/content/${id}/image`, edit.file);
      toast.success("Saved — it appears on every card");
      setEdit(null);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function move(i: number, dir: -1 | 1) {
    const ids = items.map((x) => x._id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    await api.post("/org/content/reorder", { ids }).catch((e) => toast.error(errMsg(e)));
    reload();
  }

  return (
    <>
      <PageHeader
        eyebrow="Company Admin"
        title="Products, gallery & videos"
        sub="Company-wide content shown on every employee card. Turn sections on or off in Branding & card design."
        actions={
          <Button variant="primary" onClick={() => setEdit({ title: "", description: "", url: "" })}>
            <Plus /> Add {L.one}
          </Button>
        }
      />
      <div className="mb-4">
        <Segmented
          label="Content type"
          value={kind}
          onChange={setKind}
          options={[
            { value: "product", label: `Products (${(data || []).filter((i) => i.kind === "product").length})` },
            { value: "gallery", label: `Gallery (${(data || []).filter((i) => i.kind === "gallery").length})` },
            { value: "video", label: `Videos (${(data || []).filter((i) => i.kind === "video").length})` },
          ]}
        />
      </div>
      <Panel>
        <PanelHeader title={L.title} sub={L.help} />
        {items.length === 0 ? (
          <Empty icon={<L.icon />} title={`No ${L.one}s yet`} action={<Button onClick={() => setEdit({ title: "", description: "", url: "" })}>Add {L.one}</Button>} />
        ) : (
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((it, i) => (
              <div key={it._id} className="flex flex-col overflow-hidden rounded-xl border border-line">
                <div className="aspect-[16/9] bg-surface-2 bg-cover bg-center" style={{ backgroundImage: it.kind === "video" ? `url(https://i.ytimg.com/vi/${it.youtubeId}/hqdefault.jpg)` : it.imageUrl ? `url(${it.imageUrl})` : undefined }}>
                  {!it.imageUrl && it.kind !== "video" && <div className="grid h-full place-items-center text-[12px] text-muted">No image</div>}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <b className="text-sm">{it.title || <span className="text-muted">Untitled</span>}</b>
                  {it.description && <p className="line-clamp-2 text-[12px] text-muted">{it.description}</p>}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                    <label className="flex items-center gap-2 text-[12px] text-muted">
                      <Switch
                        checked={it.isActive}
                        label="Show on cards"
                        onCheckedChange={async (v) => {
                          await api.patch(`/org/content/${it._id}`, { isActive: v }).catch((e) => toast.error(errMsg(e)));
                          reload();
                        }}
                      />
                      Shown
                    </label>
                    <div className="flex gap-0.5">
                      <Button size="icon-sm" variant="ghost" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                        <ArrowUp />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === items.length - 1}>
                        <ArrowDown />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEdit({ id: it._id, title: it.title, description: it.description, url: it.url })}>
                        Edit
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Delete"
                        onClick={async () => {
                          if (!(await confirm({ title: "Delete this item?", body: "It is removed from every card.", confirmLabel: "Delete", danger: true }))) return;
                          await api.del(`/org/content/${it._id}`).catch((e) => toast.error(errMsg(e)));
                          reload();
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Dialog
        open={Boolean(edit)}
        onOpenChange={(o) => !o && setEdit(null)}
        title={`${edit?.id ? "Edit" : "Add"} ${L.one}`}
        footer={
          <>
            <Button onClick={() => setEdit(null)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={save}>
              Save
            </Button>
          </>
        }
      >
        {edit && (
          <div className="grid gap-4">
            <Field label={kind === "product" ? "Product or service name" : "Title"}>
              <Input value={edit.title} maxLength={120} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            </Field>
            {kind === "product" && (
              <Field label="Short description">
                <Textarea value={edit.description} maxLength={500} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
              </Field>
            )}
            {kind !== "gallery" && (
              <Field label={kind === "video" ? "YouTube link" : "Link (optional)"} hint={kind === "video" ? "e.g. https://www.youtube.com/watch?v=..." : "Opens when the tile is tapped"}>
                <Input value={edit.url} onChange={(e) => setEdit({ ...edit, url: e.target.value })} />
              </Field>
            )}
            {kind !== "video" && (
              <Field label="Image" hint="JPG, PNG or WEBP up to 5 MB">
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => setEdit({ ...edit, file: e.target.files?.[0] || null })} />
                <Button type="button" size="sm" className="self-start" onClick={() => fileRef.current?.click()}>
                  <ImagePlus /> {edit.file ? edit.file.name : "Choose image"}
                </Button>
              </Field>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
