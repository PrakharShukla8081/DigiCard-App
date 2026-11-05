import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
