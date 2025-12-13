import { NextRequest } from "next/server";
import { getRouteTrips } from "@/lib/ridership-handlers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return getRouteTrips(request, id);
}
