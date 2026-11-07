import Link from "next/link";
import { CardStatusMessage } from "@/components/card/card-status-message";

export default function CardNotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <CardStatusMessage kind="notFound" />
        <Link href="/" className="mt-4 inline-block font-semibold text-accent hover:underline">
          Beno Digital Card
        </Link>
      </div>
    </main>
  );
}
