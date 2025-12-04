import { NextRequest } from "next/server";
import { getSystemByDay } from "@/lib/ridership-handlers";

export async function GET(request: NextRequest) {
  return getSystemByDay(request);
}
