import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

const STORE_NAME = "product-images";
const STORE_REGION = "ap-southeast-2";
const IMAGE_KEY_PATTERN = /^products\/[a-f0-9-]+\/[a-f0-9-]+\.(?:avif|gif|jpe?g|png|webp)$/i;
const MAX_IMAGE_BYTES = 5_000_000;
const IMAGE_TYPES = new Map([
  ["image/avif", "avif"],
  ["image/gif", "gif"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function imageStore() {
  // Product photos must survive deploys, so use one site-wide store in the local region.
  return getStore({ name: STORE_NAME, region: STORE_REGION, consistency: "strong" });
}

export function isStoredProductImageKey(value) {
  return IMAGE_KEY_PATTERN.test(String(value || ""));
}

export function productImageUrl(key) {
  return `/api/product-images?key=${encodeURIComponent(key)}`;
}

export async function uploadProductImage(file) {
  if (!file || typeof file.arrayBuffer !== "function") throw new Error("Choose a product image to upload.");
  const contentType = String(file.type || "").toLowerCase();
  const extension = IMAGE_TYPES.get(contentType);
  if (!extension) throw new Error("Use a JPG, PNG, WebP, AVIF, or GIF product image.");
  if (!Number.isFinite(file.size) || file.size < 1 || file.size > MAX_IMAGE_BYTES) {
    throw new Error("Each product image must be smaller than 5 MB.");
  }

  const key = `products/${crypto.randomUUID()}/${crypto.randomUUID()}.${extension}`;
  await imageStore().set(key, file, { metadata: { contentType } });
  return { id: key, src: productImageUrl(key) };
}

export async function readProductImage(key) {
  if (!isStoredProductImageKey(key)) return null;
  const stored = await imageStore().getWithMetadata(key, { type: "arrayBuffer", consistency: "strong" });
  if (!stored || !stored.data) return null;
  const contentType = IMAGE_TYPES.has(String(stored.metadata?.contentType || "").toLowerCase())
    ? String(stored.metadata.contentType).toLowerCase()
    : "application/octet-stream";
  return { data: stored.data, contentType, etag: stored.etag };
}
