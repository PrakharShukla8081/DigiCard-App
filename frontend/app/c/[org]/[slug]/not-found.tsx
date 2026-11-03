import Link from "next/link";

export default function CardNotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <h1 className="text-2xl font-bold">Card not found</h1>
        <p className="mt-2 text-muted">Check the link or scan the QR code again.</p>
        <Link href="/" className="mt-4 inline-block font-semibold text-accent hover:underline">
          Beno Digital Card
        </Link>
      </div>
    </main>
  );
}
