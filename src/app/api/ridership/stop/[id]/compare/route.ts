import { NextRequest } from "next/server";
import { getStopComparison } from "@/lib/ridership-handlers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return getStopComparison(request, id);
}
