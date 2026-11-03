import { Suspense } from "react";
import Link from "next/link";
import { Logo } from "@/components/shell/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="page-pad flex flex-col py-8">
        <Link href="/" className="w-fit">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
          <Suspense>{children}</Suspense>
        </div>
        <p className="text-[12px] text-muted">© {new Date().getFullYear()} Beno Support Technologies</p>
      </div>
      <div className="relative hidden overflow-hidden bg-fg lg:block" aria-hidden>
        <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 80% 10%, #4F46E555 0, transparent 45%), radial-gradient(circle at 10% 90%, #10B98133 0, transparent 40%)" }} />
        <div className="relative flex h-full flex-col justify-center gap-6 px-16 text-white">
          <div className="max-w-md">
            <div className="text-[12px] font-bold tracking-[0.12em] text-white/60 uppercase">Beno Digital Card</div>
            <h2 className="mt-3 font-display text-[38px] leading-[1.1] font-bold">Every employee&apos;s visiting card, managed from one place.</h2>
            <p className="mt-4 text-[15px] text-white/70">Upload your team from Excel, apply your brand once, and share cards by link, QR code or WhatsApp.</p>
          </div>
          <div className="w-[300px] rotate-[-4deg] rounded-[26px] bg-white p-5 text-[#0F172A] shadow-2xl">
            <div className="-mx-5 -mt-5 mb-[-34px] h-24 rounded-t-[26px]" style={{ background: "linear-gradient(135deg,#0E7490,#0E7490 50%,#F59E0B 150%)" }} />
            <div className="grid size-16 place-items-center rounded-[20px] border-4 border-white font-display text-xl font-bold text-white" style={{ background: "linear-gradient(135deg,#0E7490,#F59E0B)" }}>
              RS
            </div>
            <div className="mt-2 font-display text-lg font-bold">Rahul Sharma</div>
            <div className="text-[13px] font-semibold text-[#0E7490]">Senior Sales Manager</div>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {["Call", "WhatsApp", "Email", "Web"].map((l, i) => (
                <div key={l} className="flex flex-col items-center gap-1 text-[10px] font-semibold text-[#5B6475]">
                  <span className="size-10 rounded-xl" style={{ background: i === 1 ? "#25D366" : "#E6F1F4" }} />
                  {l}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
