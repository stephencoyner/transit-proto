import { NextRequest } from "next/server";
import { getSystemByPeriod } from "@/lib/ridership-handlers";

export async function GET(request: NextRequest) {
  return getSystemByPeriod(request);
}
