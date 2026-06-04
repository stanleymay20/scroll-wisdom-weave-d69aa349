// Pins the image-dimension decoder used by the sell-safety verifier.
// Failures here mean a too-small cover slips past the KDP gate, or a real
// JPEG/PNG header gets misread (false positives reject legitimate covers).
import { describe, it, expect } from "vitest";
import {
  readImageDimensions, detectImageMime,
} from "../../../supabase/functions/_shared/asset-fetch";

function pngHeader(width: number, height: number): Uint8Array {
  // PNG signature + IHDR chunk header + width + height (big-endian uint32 each).
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  // IHDR length (13) and "IHDR" — bytes 8..15. Width/height at 16..23.
  b.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, width);
  dv.setUint32(20, height);
  return b;
}

function jpegHeader(width: number, height: number): Uint8Array {
  // Minimal SOI + APP0 + SOF0 frame.
  // SOI=FFD8, APP0=FFE0 with length=16, SOF0=FFC0 length=17 precision=8 H/W as big-endian.
  const out: number[] = [
    0xff, 0xd8,                         // SOI
    0xff, 0xe0, 0x00, 0x10,             // APP0 marker + length 16
    0x4a, 0x46, 0x49, 0x46, 0x00,       // JFIF\0
    0x01, 0x01, 0x00, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, // version + density
    0xff, 0xc0, 0x00, 0x11, 0x08,       // SOF0 marker + length 17 + precision 8
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ];
  return new Uint8Array(out);
}

describe("readImageDimensions — PNG", () => {
  it("decodes 2560×1600", () => {
    const b = pngHeader(2560, 1600);
    expect(readImageDimensions(b, "image/png")).toEqual({ width: 2560, height: 1600 });
  });

  it("decodes a thumbnail 500×800", () => {
    const b = pngHeader(500, 800);
    expect(readImageDimensions(b, "image/png")).toEqual({ width: 500, height: 800 });
  });

  it("returns null when the buffer is too short", () => {
    expect(readImageDimensions(new Uint8Array(10), "image/png")).toBeNull();
  });
});

describe("readImageDimensions — JPEG", () => {
  it("decodes 1600×2400 from a minimal SOF0 frame", () => {
    const b = jpegHeader(1600, 2400);
    expect(readImageDimensions(b, "image/jpeg")).toEqual({ width: 1600, height: 2400 });
  });

  it("returns null on a non-JPEG buffer", () => {
    const b = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    expect(readImageDimensions(b, "image/jpeg")).toBeNull();
  });
});

describe("detectImageMime", () => {
  it("identifies PNG by signature", () => {
    expect(detectImageMime(pngHeader(1, 1))).toBe("image/png");
  });

  it("identifies JPEG by SOI", () => {
    expect(detectImageMime(jpegHeader(1, 1))).toBe("image/jpeg");
  });

  it("returns null for non-images", () => {
    expect(detectImageMime(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBeNull();
  });
});
