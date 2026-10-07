import { Suspense } from "react";
import { connection } from "next/server";
import { Arena } from "@/components/Arena";
import { readBoard } from "@/lib/pipeline";

// The shell streams instantly; the last board snapshot (a local file read) fills in right behind it.
export default function Page() {
  return (
    <Suspense fallback={<Arena initial={null} deferLive />}>
      <Board />
    </Suspense>
  );
}

async function Board() {
  await connection();
  return <Arena initial={await readBoard()} />;
}
