import { NextRequest } from "next/server";
import { getSystemComparison } from "@/lib/ridership-handlers";

export async function GET(request: NextRequest) {
  return getSystemComparison(request);
}
