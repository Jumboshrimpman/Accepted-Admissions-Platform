const MAX_EDGE = 900;
const JPEG_QUALITY = 0.85;
const MAX_BYTES = 1_800_000;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image could not be read."));
    };
    image.src = url;
  });
}

export async function readProfilePhotoFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a jpeg, png, webp, or gif photo.");
  }
  if (file.size > 8_000_000) {
    throw new Error("Choose a photo smaller than 8 MB.");
  }

  const image = await loadImage(file);
  const longest = Math.max(image.width, image.height);
  const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare the photo for upload.");
  }
  context.drawImage(image, 0, 0, width, height);

  let quality = JPEG_QUALITY;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > MAX_BYTES && quality > 0.45) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  if (dataUrl.length > MAX_BYTES) {
    throw new Error("That photo is still too large after compression. Try a smaller file.");
  }
  return dataUrl;
}

export function defaultPhotoAltText(name: string, title: string) {
  const trimmedName = name.trim() || "Team member";
  const trimmedTitle = title.trim();
  return trimmedTitle ? `${trimmedName}, ${trimmedTitle}` : trimmedName;
}
