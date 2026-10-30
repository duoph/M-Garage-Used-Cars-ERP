import { NextResponse, type NextRequest } from "next/server";
import { READ_URL_TTL_SECONDS, readUrl } from "@/lib/server/r2";
import { isValidVehicleObjectKey } from "@/lib/images/r2-keys";

/** Redirects to the photo in R2 so the bucket can stay private and <img> tags need no extra fetch. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/images/[...key]">) {
  const { key } = await ctx.params;
  const objectKey = key.join("/");
  if (!isValidVehicleObjectKey(objectKey)) return new NextResponse(null, { status: 404 });
  try {
    const response = NextResponse.redirect(await readUrl(objectKey), 302);
    // Let the browser reuse the redirect a little less long than the signed URL stays valid.
    response.headers.set("Cache-Control", `private, max-age=${READ_URL_TTL_SECONDS - 300}`);
    return response;
  } catch (error) {
    console.error("R2 read failed", error);
    return new NextResponse(null, { status: 502 });
  }
}
