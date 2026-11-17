import { test } from "node:test";
import assert from "node:assert/strict";
import { renderQrSvg } from "../src/services/qr.js";

function assertSingleSvgRoot(svg) {
  const tags = [...svg.matchAll(/<\/?svg\b[^>]*>/gi)];
  let depth = 0;
  let rootCount = 0;

  for (const [tag] of tags) {
    if (tag.startsWith("</")) {
      depth -= 1;
      assert.ok(depth >= 0, "SVG closing tag must match an open tag");
    } else {
      if (depth === 0) rootCount += 1;
      depth += 1;
    }
  }

  assert.equal(rootCount, 1, "SVG must have exactly one top-level root");
  assert.equal(depth, 0, "SVG tags must be balanced");
  assert.ok(svg.startsWith("<svg "), "SVG root must be the first content");
  assert.ok(svg.endsWith("</svg>"), "No content may follow the final SVG closing tag");
}

test("framed QR SVG has one root with and without a logo", async () => {
  const style = {
    foreground: "#111827",
    background: "#FFFFFF",
    useLogo: true,
    frame: "label",
    frameText: "Scan to save my contact",
  };

  for (const logoData of [undefined, "data:image/png;base64,AAAA"]) {
    const svg = await renderQrSvg("https://example.com/card", style, {
      logoData,
      name: "A sample name",
    });
    assertSingleSvgRoot(svg);
  }
});
