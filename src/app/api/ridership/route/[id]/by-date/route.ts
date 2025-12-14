import { NextRequest } from "next/server";
import { getRouteByDate } from "@/lib/ridership-handlers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return getRouteByDate(request, id);
}
