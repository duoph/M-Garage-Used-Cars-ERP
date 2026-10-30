import { NextResponse } from "next/server";
import { bucketUsage } from "@/lib/server/r2";

/** How much of the R2 bucket is in use, for the Settings → Photo storage meter. */
export async function GET() {
  try {
    // R2's free tier includes 10 GB; set R2_STORAGE_QUOTA_GB to whatever plan or budget applies.
    const quotaGb = Number(process.env.R2_STORAGE_QUOTA_GB) || 10;
    return NextResponse.json({ ...(await bucketUsage()), quotaBytes: quotaGb * 1024 ** 3 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("R2 usage lookup failed", error);
    return NextResponse.json({ error: "Photo storage is unavailable." }, { status: 500 });
  }
}
