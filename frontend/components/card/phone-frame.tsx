/** Phone-shaped frame used for live previews in admin and employee screens. */
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[380px] rounded-[40px] bg-[#0b0f1a] p-2.5 shadow-[0_20px_50px_rgba(15,23,42,0.25)] max-sm:rounded-[22px] max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none">
      <div className="h-[min(720px,calc(100dvh-200px))] min-h-[520px] overflow-y-auto rounded-[31px] bg-white [scrollbar-width:none] max-sm:h-auto max-sm:min-h-0 max-sm:rounded-[20px] max-sm:border max-sm:border-line">{children}</div>
    </div>
  );
}
