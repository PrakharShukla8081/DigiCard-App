import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <div className="eyebrow">404</div>
        <h1 className="mt-2 text-2xl font-bold">Page not found</h1>
        <p className="mt-2 text-muted">The page you are looking for does not exist.</p>
        <Link href="/" className="mt-4 inline-block font-semibold text-accent hover:underline">
          Go home
        </Link>
      </div>
    </main>
  );
}
