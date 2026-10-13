import { NextRequest, NextResponse } from "next/server";
import { getSearchIndex } from "@/execution/data";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  if (q.length < 2) return NextResponse.json([]);
  const index = await getSearchIndex();
  const starts: typeof index = [];
  const contains: typeof index = [];
  for (const row of index) {
    const name = row.name.toLowerCase();
    if (name.startsWith(q)) starts.push(row);
    else if (name.includes(q)) contains.push(row);
    if (starts.length >= 8) break;
  }
  return NextResponse.json([...starts, ...contains].slice(0, 8), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
