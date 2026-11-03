import { Check, Circle } from "lucide-react";

export function passwordProblem(pw: string, confirm?: string) {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Password must contain letters and numbers.";
  if (confirm !== undefined && pw !== confirm) return "The two passwords do not match.";
  return null;
}

export function PasswordRules({ value }: { value: string }) {
  const rules = [
    { ok: value.length >= 8, label: "At least 8 characters" },
    { ok: /[A-Za-z]/.test(value) && /\d/.test(value), label: "Letters and numbers" },
  ];
  return (
    <ul className="flex flex-col gap-1 text-[12px]">
      {rules.map((r) => (
        <li key={r.label} className={r.ok ? "flex items-center gap-1.5 font-semibold text-ok" : "flex items-center gap-1.5 text-muted"}>
          {r.ok ? <Check className="size-3.5" /> : <Circle className="size-3.5" />}
          {r.label}
        </li>
      ))}
    </ul>
  );
}
