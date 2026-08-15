/**
 * Pix QR rendering (payments spec: QR rendering decision).
 *
 * The EMV `qrCode` payload arrives client-side from the pix POST, so the QR
 * image is produced in the browser with the `qrcode` library (`toDataURL`).
 * The converter is injected so tests never import the real library; the
 * waiting screen wires the default to `QRCode.toDataURL`. A null or empty
 * payload renders nothing (the copy fallback is shown instead) — no broken
 * image.
 */
export interface QrDeps {
  toDataURL: (text: string) => Promise<string>;
}

export async function qrDataUrl(
  emv: string | null | undefined,
  deps: QrDeps,
): Promise<string | null> {
  if (!emv) return null;
  return deps.toDataURL(emv);
}