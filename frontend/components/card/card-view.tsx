"use client";

import { useEffect, useMemo, useState } from "react";
import type { CardPayload, QrStyle } from "@/lib/types";
import { qrPng } from "@/lib/qr";
import { httpUrl, inkFor, initials } from "@/lib/utils";
import { I } from "./icons";
import { cardText, localizeCardError, type CardCopyKey, type CardLanguage } from "@/lib/i18n/card";
import "./card.css";

type Track = (type: string, meta?: string) => void;

/** wa.me needs digits with country code; a bare 10-digit number is treated as Indian (+91). */
export function waLink(num: string, text?: string) {
  let d = (num || "").replace(/\D/g, "");
  if (d.length === 10) d = "91" + d;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

const SOCIAL_KEYS = ["linkedin", "instagram", "facebook", "youtube", "twitter"] as const;

function useQr(url: string, style?: Partial<QrStyle>) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    qrPng(url, style, 360)
      .then((s) => alive && setSrc(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url, style]);
  return src;
}

/**
 * Renders a digital visiting card. `mode="preview"` (admin / employee screens) keeps
 * buttons inert and records nothing; `mode="public"` is the real card.
 */
export function CardView({ card, mode = "public", onTrack, source = "direct", language = card.company.cardLanguage || "en", onLanguageChange }: { card: CardPayload; mode?: "public" | "preview"; onTrack?: Track; source?: string; language?: CardLanguage; onLanguageChange?: (language: CardLanguage) => void }) {
  const e = card.employee;
  const c = card.company;
  const sec = card.sections;
  const preview = mode === "preview";
  const t = (key: CardCopyKey, values?: Record<string, string>) => cardText(language, key, values);
  const qrStyle = useMemo(() => ({ ...(card.company.qr || {}), logoUrl: card.company.logoUrl, name: card.employee.name }), [card.company.qr, card.company.logoUrl, card.employee.name]);
  const qr = useQr(card.url, qrStyle);
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
      alertToast(t("linkCopied"));
    } catch {
      window.prompt(t("copyLink"), card.url);
    }
  }

  return (
    <article className={`vc vc--${card.template} ${language === "hi" ? "vc--lang-hi" : ""}`} style={style}>
      <div className="vc-cover">
        {onLanguageChange && <button className="vc-lang-toggle" type="button" onClick={() => onLanguageChange(language === "hi" ? "en" : "hi")} aria-label={t("switchLanguage")} title={t("switchLanguage")}><span className={language === "en" ? "active" : ""}>EN</span><span aria-hidden="true"> | </span><span className={language === "hi" ? "active" : ""}>हिं</span></button>}
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
        <h1 className="vc-name">{e.name || t("nameFallback")}</h1>
        {e.designation && <div className="vc-role">{e.designation}</div>}
        <div className="vc-org">
          {e.department}
          {e.department && c.name ? " · " : ""}
          <span className="vc-org-name">{c.name}</span>
          {card.verified?.isVerified && (
            <span
              className="vc-verified"
              title={t("verifiedCompanyBy", { date: new Date(card.verified.verifiedAt || Date.now()).toLocaleDateString(language === "hi" ? "hi-IN" : "en") })}
              aria-label={`${t("verifiedCompany")}: ${t("verifiedCompanyBy", { date: new Date(card.verified.verifiedAt || Date.now()).toLocaleDateString(language === "hi" ? "hi-IN" : "en") })}`}
            >
              {I.verified}
              <span>{t("verifiedCompany")}</span>
            </span>
          )}
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
          <span>{I.phone}</span>{t("call")}
        </a>
        <a className="vc-act wa" href={e.whatsapp ? waLink(e.whatsapp) : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!e.whatsapp} onClick={(ev) => (guard(ev), track("whatsapp_click"))}>
          <span>{I.wa}</span>{t("whatsapp")}
        </a>
        <a className="vc-act" href={e.email ? `mailto:${e.email}` : undefined} aria-disabled={!e.email} onClick={(ev) => (guard(ev), track("email_click"))}>
          <span>{I.mail}</span>{t("email")}
        </a>
        <a className="vc-act" href={e.website ? httpUrl(e.website) : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!e.website} onClick={(ev) => (guard(ev), track("website_click"))}>
          <span>{I.globe}</span>{t("website")}
        </a>
      </div>

      {sec.about && e.bio && (
        <section className="vc-sec">
          <h4>{t("about")}</h4>
          <p className="vc-bio">{e.bio}</p>
        </section>
      )}

      {sec.contact && (e.mobile || e.email || e.website) && (
        <section className="vc-sec">
          <h4>{t("contact")}</h4>
          <div className="vc-list">
            {e.mobile && (
              <div className="vc-li">
                {I.phone}
                <div>
                  {e.mobile}
                  <small>{t("mobile")}</small>
                </div>
              </div>
            )}
            {e.email && (
              <div className="vc-li">
                {I.mail}
                <div>
                  {e.email}
                  <small>{t("email")}</small>
                </div>
              </div>
            )}
            {e.website && (
              <div className="vc-li">
                {I.globe}
                <div>
                  {e.website.replace(/^https?:\/\//, "")}
                  <small>{t("website")}</small>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {sec.social && socials.length > 0 && (
        <section className="vc-sec">
          <h4>{t("social")}</h4>
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
          <h4>{t("products")}</h4>
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
          <h4>{t("gallery")}</h4>
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
          <h4>{t("videos")}</h4>
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
                <span>{v.title || t("watchVideo")}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {sec.companyInfo && (c.description || c.address || c.phone) && (
        <section className="vc-sec">
          <h4>{t("aboutCompany", { name: c.name })}</h4>
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

      {sec.enquiry && <Enquiry card={card} preview={preview} source={source} language={language} />}

      {sec.qr && (
        <section className="vc-sec">
          <div className="vc-qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="q">{qr && <img src={qr} alt={`${t("scanOpen")}: ${e.name}`} />}</div>
            <div>
              <b>{t("scanOpen")}</b>
              <p>{t("scanSave", { name: e.firstName || t("thisContact") })}</p>
            </div>
          </div>
        </section>
      )}

      {card.poweredBy && <div className="vc-foot">{card.poweredBy}</div>}

      <div className="vc-dock">
        <a className="save" href={preview ? undefined : vcardHref} onClick={guard} download>
          {I.save}{t("saveContact")}
        </a>
        <button className="share" type="button" aria-label={t("shareCard")} onClick={share}>
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

function Enquiry({ card, preview, source, language }: { card: CardPayload; preview: boolean; source: string; language: CardLanguage }) {
  const t = (key: CardCopyKey, values?: Record<string, string>) => cardText(language, key, values);
  const [state, setState] = useState<{ busy: boolean; ok?: string; err?: string }>({ busy: false });
  const [consent, setConsent] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const consentText = t("consentEnquiry", { company: card.company.name });
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
        body: JSON.stringify({ ...body, lang: language, consent: Boolean(body.consent), orgSlug: card.orgSlug, slug: card.slug, source }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "");
      (ev.target as HTMLFormElement).reset();
      setConsent(false);
      setState({ busy: false, ok: t("enquirySuccess") });
    } catch (err) {
      setState({ busy: false, err: localizeCardError((err as Error).message, language) });
    }
  }
  return (
    <section className="vc-sec">
      <h4>{t("sendEnquiry")}</h4>
      <form className="vc-form" onSubmit={submit}>
        <input name="name" placeholder={t("yourName")} aria-label={t("yourName")} required minLength={2} maxLength={120} onInvalid={(ev) => ev.currentTarget.setCustomValidity(t(ev.currentTarget.validity.valueMissing ? "nameRequired" : "nameTooShort"))} onInput={(ev) => ev.currentTarget.setCustomValidity("")} />
        <input name="phone" placeholder={t("phoneNumber")} aria-label={t("phoneNumber")} inputMode="tel" maxLength={20} />
        <input name="email" type="email" placeholder={t("emailOptional")} aria-label={t("email")} maxLength={254} onInvalid={(ev) => ev.currentTarget.setCustomValidity(t("validEmail"))} onInput={(ev) => ev.currentTarget.setCustomValidity("")} />
        <textarea name="message" placeholder={t("howHelp")} aria-label={t("howHelp")} maxLength={2000} />
        <label className="vc-consent">
          <input name="consent" type="checkbox" checked={consent} onChange={(ev) => { ev.currentTarget.setCustomValidity(""); setConsent(ev.target.checked); }} onInvalid={(ev) => ev.currentTarget.setCustomValidity(t("consentRequired"))} required aria-describedby="enquiry-consent-help" />
          <span>{consentText}</span>
        </label>
        <small id="enquiry-consent-help" className="vc-consent-help">
          See{" "}
          <a href={card.company.privacyPolicyUrl || "/privacy"} target={card.company.privacyPolicyUrl ? "_blank" : undefined} rel={card.company.privacyPolicyUrl ? "noopener noreferrer" : undefined}>
          {t("privacyPolicy")}
          </a>
        </small>
        <input name="website" className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" />
        <button type="submit" disabled={state.busy || preview || !consent}>
          {state.busy ? t("sending") : t("sendTo", { name: card.employee.firstName || t("thisContact") })}
        </button>
        {state.ok && <p className="msg ok">{state.ok}</p>}
        {state.err && <p className="msg err">{state.err}</p>}
      </form>
      <button className="vc-exchange-trigger" type="button" disabled={preview} onClick={() => setExchangeOpen(true)}>{t("shareDetails")}</button>
      {exchangeOpen && <ContactExchange card={card} source={source} language={language} onClose={() => setExchangeOpen(false)} />}
    </section>
  );
}

function ContactExchange({ card, source, language, onClose }: { card: CardPayload; source: string; language: CardLanguage; onClose: () => void }) {
  const t = (key: CardCopyKey, values?: Record<string, string>) => cardText(language, key, values);
  const [state, setState] = useState<{ busy: boolean; ok?: string; err?: string }>({ busy: false });
  const [consent, setConsent] = useState(false);
  const consentText = t("consentExchange", { company: card.company.name });
  async function submit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    setState({ busy: true });
    try {
      const res = await fetch("/api/public/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, kind: "exchange", lang: language, consent: Boolean(body.consent), orgSlug: card.orgSlug, slug: card.slug, source }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "");
      form.reset();
      setConsent(false);
      setState({ busy: false, ok: t("exchangeSuccess", { name: card.employee.firstName || t("thisContact") }) });
    } catch (err) {
      setState({ busy: false, err: localizeCardError((err as Error).message, language) });
    }
  }
  return (
    <div className="vc-exchange-backdrop" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <dialog open className="vc-exchange-dialog" aria-modal="true" aria-labelledby="vc-exchange-title" onKeyDown={(ev) => { if (ev.key === "Escape") onClose(); }}>
        <button type="button" className="vc-exchange-close" onClick={onClose} aria-label={t("close")}>×</button>
        <h3 id="vc-exchange-title">{t("shareDetails")}</h3>
        <p className="vc-exchange-description">{t("shareContactWith", { name: card.employee.firstName || card.employee.name })}</p>
        {state.ok ? <p className="msg ok" role="status">{state.ok}</p> : (
          <form className="vc-form" onSubmit={submit}>
            <input name="name" placeholder={t("yourName")} aria-label={t("yourName")} required minLength={2} maxLength={120} onInvalid={(ev) => ev.currentTarget.setCustomValidity(t(ev.currentTarget.validity.valueMissing ? "nameRequired" : "nameTooShort"))} onInput={(ev) => ev.currentTarget.setCustomValidity("")} />
            <input name="email" type="email" placeholder={t("email")} aria-label={t("email")} maxLength={254} onInvalid={(ev) => ev.currentTarget.setCustomValidity(t("validEmail"))} onInput={(ev) => ev.currentTarget.setCustomValidity("")} />
            <input name="phone" placeholder={t("phoneNumber")} aria-label={t("phoneNumber")} inputMode="tel" maxLength={20} />
            <input name="company" placeholder={t("company")} aria-label={t("company")} maxLength={120} />
            <input name="designation" placeholder={t("designation")} aria-label={t("designation")} maxLength={100} />
            <textarea name="note" placeholder={t("noteOptional")} aria-label={t("noteOptional")} maxLength={300} />
            <label className="vc-consent">
              <input name="consent" type="checkbox" checked={consent} onChange={(ev) => { ev.currentTarget.setCustomValidity(""); setConsent(ev.target.checked); }} onInvalid={(ev) => ev.currentTarget.setCustomValidity(t("consentRequired"))} required />
              <span>{consentText}</span>
            </label>
            <small className="vc-consent-help">{t("see")} <a href={card.company.privacyPolicyUrl || "/privacy"}>{t("privacyPolicy")}</a></small>
            <input name="website" className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <button type="submit" disabled={state.busy || !consent}>{state.busy ? t("sending") : t("shareContact")}</button>
            {state.err && <p className="msg err" role="alert">{state.err}</p>}
          </form>
        )}
      </dialog>
    </div>
  );
}
