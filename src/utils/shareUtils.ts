import html2canvas from 'html2canvas';

export interface ShareOptions {
  filename?: string;
  format?: 'png' | 'jpeg';
  quality?: number;
}

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
    backgroundColor: '#0b0b0b',
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
 * Copies an image blob to clipboard
 */
export async function copyImageToClipboard(blob: Blob): Promise<boolean> {
  try {
    if (!navigator.clipboard || !navigator.clipboard.write) {
      console.warn('Clipboard API not supported');
      return false;
    }

    const item = new ClipboardItem({ 'image/png': blob });
    await navigator.clipboard.write([item]);
    return true;
  } catch (error) {
    console.error('Failed to copy image to clipboard:', error);
    return false;
  }
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
 * Main function to share a workout card
 * Tries native share first, then falls back to download
 */
export async function shareWorkoutCard(
  element: HTMLElement,
  workoutTitle: string,
  options?: ShareOptions
): Promise<{ success: boolean; method: 'share' | 'download' | 'clipboard' }> {
  const filename = options?.filename || `workout-${Date.now()}`;

  try {
    // Render element to canvas
    const canvas = await elementToCanvas(element);
    const blob = await canvasToBlob(canvas, options?.format || 'png', options?.quality);

    // Try native share first (mobile)
    const shared = await shareImage(blob, workoutTitle);
    if (shared) {
      return { success: true, method: 'share' };
    }

    // Fall back to download
    downloadBlob(blob, `${filename}.png`);
    return { success: true, method: 'download' };
  } catch (error) {
    console.error('Failed to share workout card:', error);
    return { success: false, method: 'download' };
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
