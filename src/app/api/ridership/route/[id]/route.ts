import { NextRequest } from "next/server";
import { getRoute } from "@/lib/ridership-handlers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return getRoute(request, id);
}
