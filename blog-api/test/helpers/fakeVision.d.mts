// Types du lecteur d'image des faux fournisseurs (fakeVision.mjs)
export interface DecodedPng {
  width: number;
  height: number;
  rgb(x: number, y: number): [number, number, number];
}

export function decodePng(buf: Buffer): DecodedPng;
export function readGlyphs(image: DecodedPng): string;
export function imageOf(body: unknown): string | null;
export function visionAnswer(body: unknown): string | null;
