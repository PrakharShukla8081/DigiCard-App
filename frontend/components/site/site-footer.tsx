import Link from "next/link";
import { Logo } from "@/components/shell/logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="page-pad mx-auto grid max-w-7xl gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted">Digital visiting cards for teams, managed in one place.</p>
          <p className="mt-2 text-xs text-muted">A product of Beno Support Technologies</p>
        </div>
        <div>
          <h2 className="font-bold">Product</h2>
          <div className="mt-3 flex flex-col gap-2 text-sm text-muted">
            <Link href="/#features" className="hover:text-fg">Features</Link>
            <Link href="/pricing" className="hover:text-fg">Pricing</Link>
            <Link href="/#faq" className="hover:text-fg">FAQ</Link>
            <Link href="/nfc" className="hover:text-fg">How NFC cards work</Link>
          </div>
        </div>
        <div>
          <h2 className="font-bold">Get started</h2>
          <div className="mt-3 flex flex-col gap-2 text-sm text-muted">
            <Link href="/demo" className="hover:text-fg">Book a demo</Link>
            <Link href="/demo?interest=trial" className="hover:text-fg">Request a free trial</Link>
            <Link href="/login" className="hover:text-fg">Log in</Link>
          </div>
        </div>
        <div>
          <h2 className="font-bold">Legal</h2>
          <div className="mt-3 flex flex-col gap-2 text-sm text-muted">
            <Link href="/privacy" className="hover:text-fg">Privacy</Link>
            <Link href="/terms" className="hover:text-fg">Terms</Link>
          </div>
        </div>
      </div>
      <div className="page-pad mx-auto max-w-7xl border-t border-line py-4 text-xs text-muted">© {new Date().getFullYear()} Beno Support Technologies. All rights reserved.</div>
    </footer>
  );
}
