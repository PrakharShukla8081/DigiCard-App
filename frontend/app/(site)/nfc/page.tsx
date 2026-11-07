import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How NFC cards work",
  description: "Use a programmable NFC tag to share a permanent Beno digital card link.",
};

const faqs = [
  {
    question: "Which NFC tag should I buy?",
    answer: "Choose an NTAG213, NTAG215, or NTAG216 tag. These are common, rewritable NFC Forum Type 2 tags supported by most modern phones.",
  },
  {
    question: "Do I need to rewrite the tag when card details change?",
    answer: "No. The tag stores your permanent card link. Update your digital card whenever you need; the link on the tag stays the same.",
  },
  {
    question: "Can every phone read an NFC tag?",
    answer: "Most recent Android phones and iPhones support NFC tag reading. NFC availability and the tap location vary by device; a QR code remains a useful alternative.",
  },
  {
    question: "Does Beno sell NFC cards or tags?",
    answer: "This guide explains how to use a tag you source separately. It does not imply that NFC cards or tags are sold by Beno.",
  },
];

export default function NfcPage() {
  return (
    <article className="page-pad mx-auto max-w-4xl py-12 sm:py-16">
      <div className="eyebrow">Tap to connect</div>
      <h1 className="mt-3 font-display text-4xl font-bold sm:text-5xl">How NFC cards work</h1>
      <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted">
        An NFC tag opens your digital business card when someone taps it with a compatible phone. The tag contains a link to your card—not a copy of your contact details.
      </p>

      <section className="mt-10 rounded-2xl border border-line bg-surface p-5 sm:p-7">
        <h2 className="text-xl font-bold">What to buy</h2>
        <p className="mt-2 leading-relaxed text-muted">
          Look for a rewritable NFC tag or card using an <strong className="text-fg">NTAG213, NTAG215, or NTAG216</strong> chip. These are commonly available from electronics retailers and card-printing vendors. Check that the product is rewritable and intended for NFC Forum Type 2-compatible phones.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-bold">Write your Beno card link</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            "Copy your permanent digital card link from your employee dashboard.",
            "Install and open the free NFC Tools app on an NFC-capable phone.",
            "Choose Write → Add record → URL.",
            "Paste your card link, choose Write, then hold the NFC tag against your phone.",
            "Tap the written tag with another phone to check that your card opens.",
          ].map((step, index) => (
            <li key={step} className="flex gap-3 rounded-xl border border-line bg-surface p-4">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-bold text-accent">{index + 1}</span>
              <span className="text-sm leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10 rounded-2xl bg-accent-soft p-5 sm:p-7">
        <h2 className="text-xl font-bold">Your link stays permanent</h2>
        <p className="mt-2 leading-relaxed">
          Your NFC tag points to your card’s permanent URL. You can update your photo, role, phone number, or other card details later without writing the tag again—as long as the card address itself remains unchanged.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold">Frequently asked questions</h2>
        <div className="mt-4 divide-y divide-line border-y border-line">
          {faqs.map((faq) => (
            <details key={faq.question} className="py-4">
              <summary className="cursor-pointer font-semibold">{faq.question}</summary>
              <p className="mt-2 text-sm leading-relaxed text-muted">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </article>
  );
}
