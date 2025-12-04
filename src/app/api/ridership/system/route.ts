import { NextRequest } from "next/server";
import { getSystem } from "@/lib/ridership-handlers";

export async function GET(request: NextRequest) {
  return getSystem(request);
}
