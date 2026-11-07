import type { Metadata } from "next";
import { DirectoryListing } from "@/components/directory/directory-listing";

export const metadata: Metadata = {
  title: "Company directory",
  robots: { index: false, follow: false },
};

export default async function PublicDirectoryPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <main className="page-pad mx-auto min-h-dvh max-w-[1080px] py-10"><DirectoryListing publicDirectory orgSlug={org} /></main>;
}
