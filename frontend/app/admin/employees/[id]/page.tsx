"use client";

import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import type { Employee } from "@/lib/types";
import { ErrorBox, PageLoader } from "@/components/ui/misc";
import { EmployeeEditor } from "@/components/admin/employee-editor";

export default function EditEmployeePage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useLoad(() => api.get<Employee>(`/org/employees/${id}`), [id]);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data || !data.card) return <PageLoader />;
  return <EmployeeEditor key={data._id} employee={data} base={data.card} onSaved={reload} />;
}
