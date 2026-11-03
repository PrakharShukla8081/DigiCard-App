"use client";

import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import type { CardPayload } from "@/lib/types";
import { ErrorBox, PageLoader } from "@/components/ui/misc";
import { EmployeeEditor } from "@/components/admin/employee-editor";

export default function NewEmployeePage() {
  const { data, error, reload } = useLoad(() => api.get<CardPayload>("/org/card-preview"));
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <PageLoader />;
  return <EmployeeEditor base={{ ...data, employee: { ...data.employee, photoUrl: "" } }} />;
}
