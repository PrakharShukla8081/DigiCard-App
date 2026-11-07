"use client";

import { useEffect, useState } from "react";
import { Copy, Radio } from "lucide-react";
import { toast } from "sonner";
import { copyText } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/misc";

type NdefRecord = { recordType: "url"; data: string };
type NdefReader = { write: (message: { records: NdefRecord[] }) => Promise<void> };
type NdefReaderConstructor = new () => NdefReader;

declare global {
  interface Window {
    NDEFReader?: NdefReaderConstructor;
  }
}

function ndefReaderAvailable() {
  return typeof window !== "undefined" && typeof window.NDEFReader === "function";
}

export function NfcLinkPanel({ link, title = "NFC card", showInstructions = false }: { link: string; title?: string; showInstructions?: boolean }) {
  const [supported, setSupported] = useState(false);
  const [writing, setWriting] = useState(false);

  useEffect(() => setSupported(ndefReaderAvailable()), []);

  async function writeTag() {
    if (!ndefReaderAvailable()) {
      toast.error("Web NFC isn’t available in this browser. Use the NFC Tools app instead.");
      return;
    }
    setWriting(true);
    try {
      const Reader = window.NDEFReader;
      if (!Reader) throw new DOMException("NFC is unavailable.", "NotSupportedError");
      const reader = new Reader();
      await reader.write({ records: [{ recordType: "url", data: link }] });
      toast.success("Link written to the NFC tag.");
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "AbortError") toast.info("NFC writing was cancelled.");
      else if (name === "NotAllowedError" || name === "SecurityError") toast.error("NFC permission was blocked. Allow NFC access and try again.");
      else if (name === "NotSupportedError") toast.error("This NFC tag can’t store the link. Try an NTAG213, 215, or 216 tag.");
      else toast.error("Couldn’t write the NFC tag. Hold it against your phone and try again.");
    } finally {
      setWriting(false);
    }
  }

  return (
    <Panel className="p-5">
      <PanelHeader title={title} sub="Tap a phone on the tag to open your permanent card link." />
      <div className="flex flex-col gap-3 px-5 pb-1">
        <div className="flex min-w-0 items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-2 px-3 py-2 text-[12px]">{link}</code>
          <Button
            size="sm"
            variant="outline"
            aria-label="Copy NFC link"
            onClick={async () => (await copyText(link) ? toast.success("NFC link copied.") : toast.error("Couldn’t copy the NFC link."))}
          >
            <Copy /> Copy
          </Button>
        </div>
        {showInstructions && supported && (
          <Button size="sm" className="self-start" onClick={writeTag} loading={writing}>
            <Radio /> Write to NFC tag
          </Button>
        )}
        {showInstructions && !supported && (
          <div className="rounded-xl bg-surface-2 p-3 text-[13px] leading-relaxed text-muted">
            <p className="font-semibold text-fg">Write with the free NFC Tools app</p>
            <p className="mt-1">Open NFC Tools → Write → Add record → URL → paste the link above → Write.</p>
          </div>
        )}
        {showInstructions && <p className="text-[12px] text-muted">The card link is permanent. You won’t need to rewrite the tag when card details change.</p>}
      </div>
    </Panel>
  );
}
