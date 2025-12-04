import { NextRequest } from "next/server";
import { getSystemByDate } from "@/lib/ridership-handlers";

export async function GET(request: NextRequest) {
  return getSystemByDate(request);
}
