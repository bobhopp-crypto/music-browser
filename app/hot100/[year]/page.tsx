import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { hot100Years, isHot100Year } from "@/lib/ranker/dates";

export const dynamic = "force-static";
export const dynamicParams = false;

type Props = { params: Promise<{ year: string }> };

export function generateStaticParams() {
  return hot100Years().map((year) => ({ year: String(year) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const year = Number((await params).year);
  return { title: isHot100Year(year) ? `${year} Hot 100 — Retroverse` : "Hot 100 — Retroverse" };
}

export default async function Hot100YearPage({ params }: Props) {
  const year = Number((await params).year);
  if (!isHot100Year(year)) notFound();
  return (
    <main style={{ fontFamily: "Georgia, serif", padding: "1.5rem" }}>
      <p>
        <Link href="/hot100">Hot 100</Link>
      </p>
      <h1>{year}</h1>
      <p>
        <Link href={`/ranker?year=${year}`}>Rank {year}</Link>
      </p>
    </main>
  );
}
