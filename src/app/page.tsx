import { Suspense } from "react";
import { after, connection } from "next/server";
import { Arena } from "@/components/Arena";
import { boardIsStale, readBoard, refreshBoard } from "@/lib/pipeline";

// The shell streams instantly; the shared board snapshot fills in right behind it.
export default function Page() {
  return (
    <Suspense fallback={<Arena initial={null} />}>
      <Board />
    </Suspense>
  );
}

async function Board() {
  await connection();
  const snapshot = await readBoard();
  // The cron keeps this fresh; this is only a safety net (locked, so one refresh at a time).
  if (boardIsStale(snapshot)) after(() => refreshBoard());
  return <Arena initial={snapshot} />;
}
