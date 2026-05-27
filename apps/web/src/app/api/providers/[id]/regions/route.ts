import { NextResponse } from "next/server";
import { getProvider, ServerProvider } from "@tent/core";
import { auth } from "@/auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("unauthorized", { status: 401 });

  const { id } = await params;
  const parsed = ServerProvider.safeParse(id);
  if (!parsed.success) return new Response("bad provider", { status: 400 });
  if (parsed.data === "selfhosted") return NextResponse.json([]);

  try {
    const regions = await getProvider(parsed.data).listRegions();
    return NextResponse.json(regions);
  } catch (err) {
    return new Response(String(err), { status: 500 });
  }
}
