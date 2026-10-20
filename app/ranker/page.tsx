import { Suspense } from "react";

import { RankerApp } from "./ranker-app";

export const dynamic = "force-static";

export default function RankerPage() {
  return (
    <main className="ranker-sheet">
      <Suspense fallback={<p className="ranker-status">Loading the ranker…</p>}>
        <RankerApp />
      </Suspense>
    </main>
  );
}
