/**
 * Orchestrates: resize → presign → PUT S3 → complete.
 * Single entry point for all upload flows.
 */
import { resizeImage, resizeVideoFrame } from "./client-resize";
import { uploadApi } from "../api/upload";
import type { Element, UploadPhase } from "../types";

interface UploadOptions {
  sceneId?: number;   // undefined = project root
  projectId: number;
  promptText?: string;
  signal?: AbortSignal;
}

/** Progress callback: phase name + overall 0–100 progress. */
export type UploadProgressCallback = (phase: UploadPhase, progress: number) => void;

/** Error thrown when presign succeeded but S3 upload failed. */
export class PresignOrphanError extends Error {
  elementId: number;
  constructor(elementId: number, cause: unknown) {
    super("S3 upload failed after presign");
    this.name = "PresignOrphanError";
    this.elementId = elementId;
    this.cause = cause;
  }
}

/*
 * Overall progress budget (% of 100):
 *   resize:        0–10
 *   presign:      10–15
 *   upload_thumb: 15–25   (small → S3 + complete thumbnail)
 *   upload_full:  25–90   (medium + original → S3, real XHR progress)
 *   completing:   90–100  (complete final)
 */

/**
 * Upload a file with client-side thumbnails via presigned URLs.
 */
export async function clientUploadFile(
  file: File,
  opts: UploadOptions,
  onThumbnailReady?: (element: Element) => void,
  onProgress?: UploadProgressCallback,
): Promise<Element> {
  const isVideo = file.type.startsWith("video/");
  const report = onProgress ?? (() => {});

  // 1. Client-side resize
  report("resize", 0);
  const thumbs = isVideo
    ? await resizeVideoFrame(file)
    : await resizeImage(file);
  report("resize", 10);

  // 2. Get presigned URLs
  report("presign", 10);
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
  report("presign", 15);

  // From this point, an Element exists on the server.
  // If S3 upload fails, wrap with PresignOrphanError so caller can clean up.
  try {
    // 3. Phase 1: Upload small thumbnail → complete(thumbnail)
    report("upload_thumb", 15);
    await putToS3(presigned_urls.small, thumbs.small, content_types.small, opts.signal, (pct) => {
      report("upload_thumb", 15 + pct * 0.05); // 15–20
    });
    report("upload_thumb", 20);
    const thumbnailElement = await uploadApi.complete(element_id, "thumbnail");
    report("upload_thumb", 25);

    if (onThumbnailReady) {
      onThumbnailReady(thumbnailElement);
    }

    // 4. Phase 2: Upload medium + original in parallel → complete(final)
    // Track combined progress: medium is ~10% of total size, original is ~90%
    const mediumSize = thumbs.medium.size;
    const originalSize = file.size;
    const totalPhase2 = mediumSize + originalSize;
    let mediumLoaded = 0;
    let originalLoaded = 0;

    const reportPhase2 = () => {
      const combined = (mediumLoaded + originalLoaded) / (totalPhase2 || 1);
      report("upload_full", 25 + combined * 65); // 25–90
    };

    await Promise.all([
      putToS3(presigned_urls.medium, thumbs.medium, content_types.medium, opts.signal, (pct) => {
        mediumLoaded = mediumSize * pct / 100;
        reportPhase2();
      }),
      putToS3(presigned_urls.original, file, content_types.original, opts.signal, (pct) => {
        originalLoaded = originalSize * pct / 100;
        reportPhase2();
      }),
    ]);

    report("completing", 90);
    const finalElement = await uploadApi.complete(element_id, "final");
    report("completing", 100);
    return finalElement;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err; // Don't wrap cancellation
    }
    throw new PresignOrphanError(element_id, err);
  }
}

/**
 * Upload blob to S3 via presigned PUT using XHR (supports progress events).
 */
function putToS3(
  url: string,
  body: Blob | File,
  contentType: string,
  signal?: AbortSignal,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress((e.loaded / e.total) * 100);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        reject(new Error(`S3 upload failed: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("S3 upload network error"));
    xhr.ontimeout = () => reject(new Error("S3 upload timeout"));

    // Wire up AbortSignal
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
      xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    }

    xhr.send(body);
  });
}
