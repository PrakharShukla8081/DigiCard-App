"use client";

import { useState } from "react";
import { Search, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useDebounced, useLoad } from "@/lib/hooks";
import type { DirectoryEntry } from "@/lib/types";
import { Empty, ErrorBox, PageHeader, PageLoader, Pagination, Panel } from "@/components/ui/misc";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type DirectoryResponse = {
  success: boolean;
  data: DirectoryEntry[];
  pagination: { page: number; limit: number; total: number };
  meta: { departments: string[] };
};

export function DirectoryListing({ publicDirectory = false, orgSlug = "" }: { publicDirectory?: boolean; orgSlug?: string }) {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search);
  const query = new URLSearchParams({ page: String(page), limit: "50" });
  if (debouncedSearch) query.set("search", debouncedSearch);
  if (department) query.set("department", department);
  const endpoint = publicDirectory ? `/public/directory/${encodeURIComponent(orgSlug)}` : "/org/directory";
  const request = `${endpoint}?${query.toString()}`;
  const { data, error, loading, reload } = useLoad(() => api.getFull<DirectoryResponse>(request), [request]);

  const title = publicDirectory ? "Company directory" : "Company directory";
  return (
    <>
      <PageHeader
        eyebrow={publicDirectory ? "Meet the team" : undefined}
        title={title}
        sub={publicDirectory ? "Find a team member and view their digital card." : "Browse published employee cards in your organization."}
      />
      <Panel className="mb-5 p-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search name, designation or department"
            aria-label="Search company directory"
            className="pl-9"
          />
        </label>
        {!!data?.meta.departments.length && (
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Filter by department">
            {["", ...data.meta.departments].map((item) => (
              <button
                key={item || "all"}
                type="button"
                aria-pressed={department === item}
                onClick={() => {
                  setDepartment(item);
                  setPage(1);
                }}
                className={cn(
                  "rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors",
                  department === item ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:bg-surface-2",
                )}
              >
                {item || "All departments"}
              </button>
            ))}
          </div>
        )}
      </Panel>

      {loading && !data ? (
        <PageLoader />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : data?.data.length ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.data.map((person) => (
              <Panel key={person.cardUrl} className="flex items-center gap-3 p-4">
                <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 font-display text-lg font-bold text-muted">
                  {person.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={person.photo} alt="" className="size-full object-cover" />
                  ) : (
                    person.name.slice(0, 1)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{person.name}</div>
                  {person.designation && <div className="truncate text-[13px] text-muted">{person.designation}</div>}
                  {person.department && <div className="truncate text-[12px] text-muted">{person.department}</div>}
                  <a href={person.cardUrl} className="mt-1 inline-block text-[12px] font-semibold text-accent hover:underline">
                    View card
                  </a>
                </div>
              </Panel>
            ))}
          </div>
          <div className="mt-5">
            <Pagination page={data.pagination.page} limit={data.pagination.limit} total={data.pagination.total} onPage={setPage} />
          </div>
        </>
      ) : (
        <Panel>
          <Empty icon={<Users />} title="No team members found" sub="Try another search or department." />
        </Panel>
      )}
    </>
  );
}
