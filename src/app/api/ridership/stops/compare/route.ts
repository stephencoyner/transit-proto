import { NextRequest } from "next/server";
import { getAllStopsComparison } from "@/lib/ridership-handlers";

export async function GET(request: NextRequest) {
  return getAllStopsComparison(request);
}
