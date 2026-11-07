type VisitorContact = {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  designation?: string;
};

function escapeVcard(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function downloadVisitorVcard(contact: VisitorContact) {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeVcard(contact.name)}`,
    contact.company && `ORG:${escapeVcard(contact.company)}`,
    contact.designation && `TITLE:${escapeVcard(contact.designation)}`,
    contact.phone && `TEL;TYPE=CELL:${escapeVcard(contact.phone)}`,
    contact.email && `EMAIL:${escapeVcard(contact.email)}`,
    "END:VCARD",
  ].filter(Boolean);
  const blob = new Blob([`${lines.join("\r\n")}\r\n`], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${contact.name.trim().replace(/[^\w.-]+/g, "_") || "contact"}.vcf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
