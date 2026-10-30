import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteObjects, presignUpload } from "@/lib/server/r2";
import { R2_MAX_OBJECT_BYTES, isAcceptedImageType, isValidVehicleObjectKey } from "@/lib/images/r2-keys";

// TODO(auth): these endpoints are open until real sign-in lands (PRODUCTION_READINESS.md §1–2).
// Keys, types and sizes are restricted below, but any caller can still upload or delete vehicle photos.

const objectKey = z.string().refine(isValidVehicleObjectKey, "Invalid object key");

const presignSchema = z.object({
  key: objectKey,
  contentType: z.string().refine(isAcceptedImageType, "Only JPEG, PNG and WebP images are supported"),
  size: z.number().int().positive().max(R2_MAX_OBJECT_BYTES, "File is too large"),
});

const deleteSchema = z.object({ keys: z.array(objectKey).min(1).max(100) });

/** Returns a short-lived presigned PUT URL the browser uploads the photo to directly. */
export async function POST(request: Request) {
  const parsed = presignSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const { key, contentType, size } = parsed.data;
  try {
    return NextResponse.json({ url: await presignUpload(key, contentType, size) });
  } catch (error) {
    console.error("R2 presign failed", error);
    return NextResponse.json({ error: "Photo storage is unavailable." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  try {
    await deleteObjects(parsed.data.keys);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("R2 delete failed", error);
    return NextResponse.json({ error: "Photo storage is unavailable." }, { status: 500 });
  }
}
