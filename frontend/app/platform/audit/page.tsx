"use client";

import { PageHeader } from "@/components/ui/misc";
import { AuditTable } from "@/components/shell/audit-table";

export default function PlatformAuditPage() {
  return (
    <>
      <PageHeader eyebrow="Beno Super Admin" title="Audit log" sub="Every sign-in, change and invite across the platform." />
      <AuditTable endpoint="/platform/audit-logs" showOrg />
    </>
  );
}
