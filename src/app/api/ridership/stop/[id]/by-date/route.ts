import { NextRequest } from "next/server";
import { getStopByDate } from "@/lib/ridership-handlers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return getStopByDate(request, id);
}
