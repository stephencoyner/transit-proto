import { NextRequest } from "next/server";
import { getAllStops } from "@/lib/ridership-handlers";

export async function GET(request: NextRequest) {
  return getAllStops(request);
}
