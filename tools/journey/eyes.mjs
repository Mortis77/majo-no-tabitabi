// Re-colour the shared iris texture (material 'EyeIris') of a cast model: the painted iris keeps its own light and dark
// (pupil, limbal ring, highlights stay where they were drawn), the chroma becomes `rgb`. Used by build-cast.mjs (every
// cast member, Elaina [133,144,218]) and swimwear.mjs (her two swimsuits), so all her outfits share one eye colour.
import sharp from 'sharp';

export async function eyes(doc, rgb) {
  const tex = doc
    .getRoot()
    .listMaterials()
    .find((m) => m.getName() === 'EyeIris')
    .getBaseColorTexture();
  const { data, info } = await sharp(tex.getImage()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = data.subarray(i, i + 3),
      chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (chroma < 7 || data[i + 3] < 2) continue;
    const l = (r * 0.24 + g * 0.5 + b * 0.26) / 135,
      s = Math.min(0.95, chroma / 50);
    for (let c = 0; c < 3; c++)
      data[i + c] = Math.min(255, data[i + c] * (1 - s) + Math.pow(l, 0.96) * rgb[c] * s);
  }
  tex
    .setImage(
      new Uint8Array(
        await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
          .png()
          .toBuffer(),
      ),
    )
    .setMimeType('image/png');
}

/** Elaina's iris colour (all her outfits). */
export const ELAINA_IRIS = [133, 144, 218];
