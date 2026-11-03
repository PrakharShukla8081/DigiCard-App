"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { CardPayload } from "@/lib/types";
import { httpUrl, inkFor, initials } from "@/lib/utils";
import { I } from "./icons";
import "./card.css";

type Track = (type: string, meta?: string) => void;

/** wa.me needs digits with country code; a bare 10-digit number is treated as Indian (+91). */
export function waLink(num: string, text?: string) {
  let d = (num || "").replace(/\D/g, "");
  if (d.length === 10) d = "91" + d;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

const SOCIAL_KEYS = ["linkedin", "instagram", "facebook", "youtube", "twitter"] as const;

function useQr(url: string) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(`${url}?src=qr`, { width: 360, margin: 1, errorCorrectionLevel: "M" })
      .then((s) => alive && setSrc(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url]);
  return src;
}

/**
 * Renders a digital visiting card. `mode="preview"` (admin / employee screens) keeps
 * buttons inert and records nothing; `mode="public"` is the real card.
 */
export function CardView({ card, mode = "public", onTrack, source = "direct" }: { card: CardPayload; mode?: "public" | "preview"; onTrack?: Track; source?: string }) {
  const e = card.employee;
  const c = card.company;
  const sec = card.sections;
  const preview = mode === "preview";
  const qr = useQr(card.url);
  const track: Track = (t, m) => !preview && onTrack?.(t, m);
  const guard = (ev: React.MouseEvent) => {
    if (preview) ev.preventDefault();
  };

  const style = { "--b1": c.primaryColor, "--b2": c.secondaryColor, "--b1ink": inkFor(c.primaryColor) } as React.CSSProperties;
  const socials = SOCIAL_KEYS.filter((k) => card.social?.[k]);
  const vcardHref = `/api/public/cards/${card.orgSlug}/${card.slug}/vcard?src=${encodeURIComponent(source)}`;
  const shareText = `${e.name}${e.designation ? `, ${e.designation}` : ""} — ${c.name}`;

  async function share(ev: React.MouseEvent) {
    ev.preventDefault();
    if (preview) return;
    track("share");
    if (navigator.share) {
      try {
        await navigator.share({ title: shareText, text: shareText, url: card.url });
        return;
      } catch {
        /* cancelled — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(card.url);
      alertToast("Link copied");
    } catch {
      window.prompt("Copy this link", card.url);
    }
  }

  return (
    <article className={`vc vc--${card.template}`} style={style}>
      <div className="vc-cover">
        <div className="vc-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {c.logoUrl ? <img src={c.logoUrl} alt={c.name} /> : <i />}
          {!c.logoUrl && <span>{c.name}</span>}
        </div>
      </div>
      <div className="vc-head">
        <div className="vc-av">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {e.photoUrl ? <img src={e.photoUrl} alt={e.name} /> : initials(e.name)}
        </div>
        <h1 className="vc-name">{e.name || "Your name"}</h1>
        {e.designation && <div className="vc-role">{e.designation}</div>}
        <div className="vc-org">
          {e.department}
          {e.department && c.name ? " · " : ""}
          {c.name}
        </div>
        {e.location && (
          <div className="vc-loc">
            {I.pin}
            {e.location}
          </div>
        )}
      </div>

      <div className="vc-acts">
        <a className="vc-act" href={e.mobile ? `tel:${e.mobile}` : undefined} aria-disabled={!e.mobile} onClick={(ev) => (guard(ev), track("call_click"))}>
          <span>{I.phone}</span>Call
        </a>
        <a className="vc-act wa" href={e.whatsapp ? waLink(e.whatsapp) : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!e.whatsapp} onClick={(ev) => (guard(ev), track("whatsapp_click"))}>
          <span>{I.wa}</span>WhatsApp
        </a>
        <a className="vc-act" href={e.email ? `mailto:${e.email}` : undefined} aria-disabled={!e.email} onClick={(ev) => (guard(ev), track("email_click"))}>
          <span>{I.mail}</span>Email
        </a>
        <a className="vc-act" href={e.website ? httpUrl(e.website) : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!e.website} onClick={(ev) => (guard(ev), track("website_click"))}>
          <span>{I.globe}</span>Website
        </a>
      </div>

      {sec.about && e.bio && (
        <section className="vc-sec">
          <h4>About</h4>
          <p className="vc-bio">{e.bio}</p>
        </section>
      )}

      {sec.contact && (e.mobile || e.email || e.website) && (
        <section className="vc-sec">
          <h4>Contact</h4>
          <div className="vc-list">
            {e.mobile && (
              <div className="vc-li">
                {I.phone}
                <div>
                  {e.mobile}
                  <small>Mobile</small>
                </div>
              </div>
            )}
            {e.email && (
              <div className="vc-li">
                {I.mail}
                <div>
                  {e.email}
                  <small>Email</small>
                </div>
              </div>
            )}
            {e.website && (
              <div className="vc-li">
                {I.globe}
                <div>
                  {e.website.replace(/^https?:\/\//, "")}
                  <small>Website</small>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {sec.social && socials.length > 0 && (
        <section className="vc-sec">
          <h4>Social</h4>
          <div className="vc-soc">
            {socials.map((k) => (
              <a key={k} href={httpUrl(card.social[k])} target="_blank" rel="noopener noreferrer" aria-label={k} onClick={(ev) => (guard(ev), track("social_click", k))}>
                {I[k]}
              </a>
            ))}
          </div>
        </section>
      )}

      {sec.products && card.content.products.length > 0 && (
        <section className="vc-sec">
          <h4>Products &amp; services</h4>
          <div className="vc-prod">
            {card.content.products.map((p) => {
              const inner = (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.imageUrl && <img src={p.imageUrl} alt="" loading="lazy" />}
                  <b>{p.title}</b>
                  {p.description}
                </>
              );
              return p.url ? (
                <a key={p.id} href={httpUrl(p.url)} target="_blank" rel="noopener noreferrer" onClick={(ev) => (guard(ev), track("website_click", "product"))}>
                  {inner}
                </a>
              ) : (
                <div key={p.id}>{inner}</div>
              );
            })}
          </div>
        </section>
      )}

      {sec.gallery && card.content.gallery.length > 0 && (
        <section className="vc-sec">
          <h4>Gallery</h4>
          <div className="vc-gal">
            {card.content.gallery.map((g) => (
              <figure key={g.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {g.imageUrl && <img src={g.imageUrl} alt={g.title || ""} loading="lazy" />}
                {g.title && <figcaption>{g.title}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}

      {sec.videos && card.content.videos.length > 0 && (
        <section className="vc-sec">
          <h4>Videos</h4>
          <div className="vc-vid">
            {card.content.videos.map((v) => (
              <a
                key={v.id}
                href={`https://www.youtube.com/watch?v=${v.youtubeId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ backgroundImage: `url(https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg)` }}
                onClick={(ev) => (guard(ev), track("social_click", "youtube_video"))}
              >
                <span>{v.title || "Watch video"}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {sec.companyInfo && (c.description || c.address || c.phone) && (
        <section className="vc-sec">
          <h4>About {c.name}</h4>
          <div className="vc-company">
            <b>{c.name}</b>
            {c.tagline && <div>{c.tagline}</div>}
            {c.description && <p>{c.description}</p>}
            {c.address && <p>{c.address}</p>}
            {(c.phone || c.email) && (
              <p>
                {c.phone}
                {c.phone && c.email ? " · " : ""}
                {c.email}
              </p>
            )}
          </div>
        </section>
      )}

      {sec.enquiry && <Enquiry card={card} preview={preview} source={source} />}

      {sec.qr && (
        <section className="vc-sec">
          <div className="vc-qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="q">{qr && <img src={qr} alt={`QR code for ${e.name}'s card`} />}</div>
            <div>
              <b>Scan to open this card</b>
              <p>Point any phone camera at the code to save {e.firstName || "this contact"}.</p>
            </div>
          </div>
        </section>
      )}

      {card.poweredBy && <div className="vc-foot">{card.poweredBy}</div>}

      <div className="vc-dock">
        <a className="save" href={preview ? undefined : vcardHref} onClick={guard} download>
          {I.save}Save contact
        </a>
        <button className="share" type="button" aria-label="Share card" onClick={share}>
          {I.share}
        </button>
      </div>
    </article>
  );
}

function alertToast(msg: string) {
  const el = document.createElement("div");
  el.textContent = msg;
  el.setAttribute("role", "status");
  el.style.cssText = "position:fixed;left:50%;bottom:calc(90px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:#0F172A;color:#fff;padding:10px 16px;border-radius:12px;font:600 13px Manrope,system-ui,sans-serif;z-index:99";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

function Enquiry({ card, preview, source }: { card: CardPayload; preview: boolean; source: string }) {
  const [state, setState] = useState<{ busy: boolean; ok?: string; err?: string }>({ busy: false });
  async function submit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (preview) return;
    const fd = new FormData(ev.currentTarget);
    const body = Object.fromEntries(fd.entries());
    setState({ busy: true });
    try {
      const res = await fetch("/api/public/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, orgSlug: card.orgSlug, slug: card.slug, source }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Could not send. Please try again.");
      (ev.target as HTMLFormElement).reset();
      setState({ busy: false, ok: json.message || "Thank you! Your enquiry has been sent." });
    } catch (err) {
      setState({ busy: false, err: (err as Error).message });
    }
  }
  return (
    <section className="vc-sec">
      <h4>Send an enquiry</h4>
      <form className="vc-form" onSubmit={submit}>
        <input name="name" placeholder="Your name" aria-label="Your name" required minLength={2} maxLength={120} />
        <input name="phone" placeholder="Phone number" aria-label="Phone number" inputMode="tel" maxLength={20} />
        <input name="email" type="email" placeholder="Email (optional if phone given)" aria-label="Email" maxLength={254} />
        <textarea name="message" placeholder="How can we help?" aria-label="Message" maxLength={2000} />
        <input name="website" className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" />
        <button type="submit" disabled={state.busy || preview}>
          {state.busy ? "Sending…" : `Send to ${card.employee.firstName || "us"}`}
        </button>
        {state.ok && <p className="msg ok">{state.ok}</p>}
        {state.err && <p className="msg err">{state.err}</p>}
      </form>
    </section>
  );
}
