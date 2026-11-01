// Image synthétique de la sonde vision (P1) : PNG réellement décodable, code lisible, vérification stricte
import { describe, it, expect } from 'vitest';
import { answerMatchesCode, encodePng, PROBE_ALPHABET, randomProbeCode, renderProbeImage, sanitizeAnswer } from '../src/ai/services/probeImage';
import { decodePng, visionAnswer } from './helpers/fakeVision.mjs';

/** Carré rouge 8 × 8 de la première version : CRC du bloc IDAT faux, flux zlib invalide */
const OLD_PROBE_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSAMrvD/E7bL4NAAAAAElFTkSuQmCC';
const asRequest = (dataUrl: string) => ({ messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: dataUrl } }] }] });

describe('image de la sonde vision', () => {
  it('l’ancienne image était un PNG corrompu (cause du bad_request)', () => {
    expect(() => decodePng(Buffer.from(OLD_PROBE_IMAGE.split(',')[1], 'base64'))).toThrow(/CRC IDAT/);
    expect(visionAnswer(asRequest(OLD_PROBE_IMAGE))).toBeNull();
  });

  it('PNG valide (signature, CRC, zlib), carré de 256 px, quelques Ko', () => {
    const url = renderProbeImage('K7R');
    expect(url).toMatch(/^data:image\/png;base64,/);
    const png = decodePng(Buffer.from(url.split(',')[1], 'base64'));
    expect([png.width, png.height]).toEqual([256, 256]);
    expect(url.length).toBeLessThan(8000);
    // Cadre bleu, fond blanc
    expect(png.rgb(2, 2)).toEqual([37, 99, 235]);
    expect(png.rgb(30, 30)).toEqual([255, 255, 255]);
  });

  it('chaque code tiré est lu à l’identique par un lecteur indépendant', () => {
    for (let i = 0; i < 150; i++) {
      const code = randomProbeCode();
      expect(code).toMatch(new RegExp(`^[${PROBE_ALPHABET}]{3}$`));
      expect(new Set(code).size).toBe(3);
      expect(visionAnswer(asRequest(renderProbeImage(code)))).toBe(code);
    }
  });

  it('codes tirés au hasard : aucune réponse devinable', () => {
    const codes = new Set(Array.from({ length: 300 }, randomProbeCode));
    expect(codes.size).toBeGreaterThan(250);
  });

  it('caractère hors alphabet refusé', () => {
    expect(() => renderProbeImage('K0R')).toThrow();
  });

  it('encodeur PNG générique : dimensions quelconques', () => {
    const png = decodePng(encodePng(3, 2, (x, y) => [x * 10, y * 20, 7]));
    expect(png.rgb(2, 1)).toEqual([20, 20, 7]);
  });
});

describe('vérification de la réponse', () => {
  it.each([
    ['K7R', true], ['k7r', true], ['Le code est K7R.', true], ['« K7R »', true], ['K 7 R', true], ['Code : K-7-R', true],
    ['K7', false], ['KR7', false], ['ICANNOTSEE', false], ['XK7RX', false], ['Je ne vois pas d’image.', false], ['', false],
  ])('%s → %s', (answer, ok) => {
    expect(answerMatchesCode(answer, 'K7R')).toBe(ok);
  });

  it('réponse renvoyée au dashboard : courte, sans balise', () => {
    expect(sanitizeAnswer('<script>alert(1)</script> K7R')).not.toMatch(/[<>]/);
    expect(sanitizeAnswer('x'.repeat(200))).toHaveLength(60);
  });
});
