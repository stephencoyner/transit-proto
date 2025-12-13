import { NextRequest } from "next/server";
import { getAllRoutes } from "@/lib/ridership-handlers";

export async function GET(request: NextRequest) {
  return getAllRoutes(request);
}
