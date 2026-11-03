"use client";

import { PageHeader } from "@/components/ui/misc";
import { AuditTable } from "@/components/shell/audit-table";

export default function OrgAuditPage() {
  return (
    <>
      <PageHeader eyebrow="Company Admin" title="Audit log" sub="Sign-ins and changes made in your company account." />
      <AuditTable endpoint="/org/audit-logs" />
    </>
  );
}
