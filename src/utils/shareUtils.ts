import html2canvas from 'html2canvas';

/**
 * Renders a DOM element to a canvas
 */
export async function elementToCanvas(
  element: HTMLElement,
  options?: { scale?: number; width?: number; height?: number }
): Promise<HTMLCanvasElement> {
  const scale = options?.scale || 2; // 2x for retina quality

  const canvas = await html2canvas(element, {
    scale,
    width: options?.width,
    height: options?.height,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#0c0d0f',
    logging: false,
  });

  return canvas;
}

/**
 * Converts a canvas to a Blob
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: 'png' | 'jpeg' = 'png',
  quality = 0.95
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob from canvas'));
        }
      },
      `image/${format}`,
      quality
    );
  });
}

/**
 * Downloads a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Renders an element straight to a PNG blob.
 *
 * Capture is slow enough (hundreds of ms on a poster) that it must NOT sit
 * between a tap and `navigator.share`: Safari expires the transient activation
 * while html2canvas runs and rejects the share. Callers capture ahead of the
 * tap that shares, and this is the one call they need to do it.
 */
export async function captureBlob(element: HTMLElement, scale = 2): Promise<Blob> {
  const canvas = await elementToCanvas(element, { scale });
  return canvasToBlob(canvas, 'png');
}

/**
 * Uses the Web Share API to share an image (mobile-friendly)
 */
export async function shareImage(
  blob: Blob,
  title: string,
  text?: string
): Promise<boolean> {
  try {
    // Check if Web Share API is supported
    if (!navigator.share) {
      return false;
    }

    const file = new File([blob], `${title}.png`, { type: 'image/png' });
    const shareData = {
      title,
      text: text || 'Check out my workout!',
      files: [file],
    };

    await navigator.share(shareData);
    return true;
  } catch (error) {
    // User cancelled or share failed
    if ((error as Error).name !== 'AbortError') {
      console.error('Share failed:', error);
    }
    return false;
  }
}

/**
 * Check if native sharing with files is supported.
 * Chrome iOS supports navigator.share but NOT file sharing,
 * so we probe canShare() with a tiny test file.
 */
export function isNativeShareSupported(): boolean {
  try {
    if (
      typeof navigator === 'undefined' ||
      typeof navigator.share !== 'function' ||
      typeof navigator.canShare !== 'function'
    ) {
      return false;
    }
    const testFile = new File([new Uint8Array(1)], 'test.png', { type: 'image/png' });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
}
