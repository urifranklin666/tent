import { getJob } from "@tent/core";
import { auth } from "@/auth";

const POLL_MS = 700;
const MAX_DURATION_MS = 30 * 60 * 1000;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("unauthorized", { status: 401 });

  const { id } = await params;
  const cursorStr = new URL(req.url).searchParams.get("cursor") ?? "0";
  let cursor = Math.max(0, parseInt(cursorStr, 10) || 0);

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function emit(event: string, payload: unknown) {
        const data = JSON.stringify(payload);
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      }

      let aborted = false;
      req.signal.addEventListener("abort", () => {
        aborted = true;
      });

      try {
        while (!aborted && Date.now() - startedAt < MAX_DURATION_MS) {
          const job = await getJob(id);
          if (!job) {
            emit("state", "failed");
            break;
          }
          const events = job.progress ?? [];
          for (let i = cursor; i < events.length; i++) {
            emit("event", events[i]);
          }
          cursor = events.length;

          if (["succeeded", "failed", "canceled"].includes(job.state)) {
            emit("state", job.state);
            break;
          }
          await sleep(POLL_MS);
        }
      } catch (err) {
        emit("error", String(err));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
