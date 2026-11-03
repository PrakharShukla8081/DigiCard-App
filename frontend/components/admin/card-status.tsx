import { Chip } from "@/components/ui/misc";
import type { Employee } from "@/lib/types";

export function CardStatusChips({ e }: { e: Pick<Employee, "cardStatus" | "isPublished"> }) {
  if (e.cardStatus === "inactive") return <Chip tone="bad">Inactive</Chip>;
  return e.isPublished ? <Chip tone="ok">Live</Chip> : <Chip tone="warn">Unpublished</Chip>;
}
