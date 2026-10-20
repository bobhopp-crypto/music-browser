import Link from "next/link";

import { hot100Years } from "@/lib/ranker/dates";

export const dynamic = "force-static";

export default function Hot100IndexPage() {
  return (
    <main style={{ fontFamily: "Georgia, serif", padding: "1.5rem" }}>
      <p>
        <Link href="/">Retroverse</Link>
      </p>
      <h1>Hot 100</h1>
      <p>
        <Link href="/ranker">Hot 100 Ranker</Link>
      </p>
      <ul>
        {hot100Years().map((year) => (
          <li key={year}>
            <Link href={`/hot100/${year}`}>{year}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
