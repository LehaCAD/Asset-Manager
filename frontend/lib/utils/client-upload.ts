/**
 * Orchestrates: resize → presign → PUT S3 → complete.
 * Single entry point for all upload flows.
 */
import { resizeImage, resizeVideoFrame } from "./client-resize";
import { uploadApi } from "../api/upload";
import type { Element } from "../types";

interface UploadOptions {
  sceneId?: number;   // undefined = project root
  projectId: number;
  promptText?: string;
  signal?: AbortSignal;
}

/**
 * Upload a file with client-side thumbnails via presigned URLs.
 * Returns the completed Element after phase=thumbnail (fast).
 * Continues uploading medium + original in background.
 */
export async function clientUploadFile(
  file: File,
  opts: UploadOptions,
  onThumbnailReady?: (element: Element) => void,
): Promise<Element> {
  const isVideo = file.type.startsWith("video/");

  // 1. Client-side resize
  const thumbs = isVideo
    ? await resizeVideoFrame(file)
    : await resizeImage(file);

  // 2. Get presigned URLs
  const presignData = opts.sceneId
    ? await uploadApi.presignForScene(opts.sceneId, {
        filename: file.name,
        file_size: file.size,
        prompt_text: opts.promptText,
      })
    : await uploadApi.presignForProject(opts.projectId, {
        filename: file.name,
        file_size: file.size,
        prompt_text: opts.promptText,
      });

  const { presigned_urls, content_types, element_id } = presignData;

  // 3. Phase 1: Upload small thumbnail → complete(thumbnail)
  await putToS3(presigned_urls.small, thumbs.small, content_types.small, opts.signal);
  const thumbnailElement = await uploadApi.complete(element_id, "thumbnail");

  if (onThumbnailReady) {
    onThumbnailReady(thumbnailElement);
  }

  // 4. Phase 2: Upload medium + original in parallel → complete(final)
  // IMPORTANT: use content_types from presign response (must match exactly)
  await Promise.all([
    putToS3(presigned_urls.medium, thumbs.medium, content_types.medium, opts.signal),
    putToS3(presigned_urls.original, file, content_types.original, opts.signal),
  ]);

  const finalElement = await uploadApi.complete(element_id, "final");
  return finalElement;
}

async function putToS3(
  url: string,
  body: Blob | File,
  contentType: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
    signal,
  });
  if (!response.ok) {
    throw new Error(`S3 upload failed: ${response.status}`);
  }
}
