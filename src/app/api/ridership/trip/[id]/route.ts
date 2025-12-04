import { NextRequest } from "next/server";
import { getTrip } from "@/lib/ridership-handlers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return getTrip(request, id);
}
