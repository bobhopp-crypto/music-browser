import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ fontFamily: "Georgia, serif", padding: "1.5rem" }}>
      <h1>Retroverse</h1>
      <p>
        <Link href="/ranker">Hot 100 Ranker</Link>
      </p>
      <p>
        <Link href="/hot100">Hot 100 years</Link>
      </p>
    </main>
  );
}
