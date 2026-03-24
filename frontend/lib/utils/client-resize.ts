/**
 * Client-side image/video resize using Canvas API.
 * Generates small (256px) + medium (800px) JPEG thumbnails.
 */

const SMALL_MAX = 256;
const MEDIUM_MAX = 800;
const SMALL_QUALITY = 0.8;
const MEDIUM_QUALITY = 0.85;

interface ResizeResult {
  small: Blob;
  medium: Blob;
}

/**
 * Resize an image file to small + medium thumbnails.
 */
export async function resizeImage(file: File): Promise<ResizeResult> {
  const bitmap = await createImageBitmap(file);
  try {
    const small = await bitmapToBlob(bitmap, SMALL_MAX, SMALL_QUALITY);
    const medium = await bitmapToBlob(bitmap, MEDIUM_MAX, MEDIUM_QUALITY);
    return { small, medium };
  } finally {
    bitmap.close();
  }
}

/**
 * Extract a frame from a video file and resize to small + medium.
 */
export async function resizeVideoFrame(file: File): Promise<ResizeResult> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Не удалось загрузить видео"));
      setTimeout(() => reject(new Error("Таймаут загрузки видео")), 15000);
    });

    // Try seek to 1s, fallback to 0.1s, then 0s
    const frame = await seekAndCapture(video, [1, 0.1, 0]);

    const bitmap = await createImageBitmap(frame);
    try {
      const small = await bitmapToBlob(bitmap, SMALL_MAX, SMALL_QUALITY);
      const medium = await bitmapToBlob(bitmap, MEDIUM_MAX, MEDIUM_QUALITY);
      return { small, medium };
    } finally {
      bitmap.close();
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function seekAndCapture(
  video: HTMLVideoElement,
  seekTimes: number[]
): Promise<ImageBitmap> {
  for (const time of seekTimes) {
    try {
      video.currentTime = Math.min(time, video.duration || time);
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject();
        setTimeout(() => reject(), 5000);
      });

      const canvas = new OffscreenCanvas(video.videoWidth, video.videoHeight);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0);
      return await createImageBitmap(canvas);
    } catch {
      continue;
    }
  }
  throw new Error("Не удалось извлечь кадр из видео");
}

async function bitmapToBlob(
  bitmap: ImageBitmap,
  maxSide: number,
  quality: number
): Promise<Blob> {
  const { width, height } = bitmap;
  let newW: number, newH: number;

  if (Math.max(width, height) <= maxSide) {
    newW = width;
    newH = height;
  } else if (width >= height) {
    newW = maxSide;
    newH = Math.round((height * maxSide) / width);
  } else {
    newH = maxSide;
    newW = Math.round((width * maxSide) / height);
  }

  const canvas = new OffscreenCanvas(newW, newH);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, newW, newH);
  return await canvas.convertToBlob({ type: "image/jpeg", quality });
}
