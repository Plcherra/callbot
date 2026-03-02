/**
 * Audio format utilities for telephony (mulaw 8kHz).
 * Used for converting between ElevenLabs output and Telnyx stream format.
 */

/** Mu-law encoding table (standard ITU-T G.711) */
const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

/**
 * Encode 16-bit PCM to 8-bit mulaw.
 * Input: 16kHz mono PCM, output: 8kHz-equivalent mulaw bytes.
 */
export function pcm16ToMulaw(pcm: Int16Array): Uint8Array {
  const out = new Uint8Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    let sample = Math.max(-MULAW_CLIP, Math.min(MULAW_CLIP, pcm[i]));
    const sign = sample < 0 ? 0x80 : 0;
    if (sign) sample = -sample;
    sample += MULAW_BIAS;
    let exponent = 7;
    for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}
    const mantissa = (sample >> (exponent + 3)) & 0x0f;
    out[i] = ~(sign | (exponent << 4) | mantissa) & 0xff;
  }
  return out;
}

/**
 * Decode mulaw to 16-bit PCM.
 */
export function mulawToPcm16(mulaw: Uint8Array): Int16Array {
  const pcm = new Int16Array(mulaw.length);
  const MULAW_DEBIAS_TABLE = [
    -32124, -31100, -30076, -29052, -28028, -27004, -25980, -24956, -23932, -22908, -21884, -20860,
    -19836, -18812, -17788, -16764, -15996, -15484, -14972, -14460, -13948, -13436, -12924, -12412,
    -11900, -11388, -10876, -10364, -9852, -9340, -8828, -8316, -7932, -7676, -7420, -7164, -6908,
    -6652, -6396, -6140, -5884, -5628, -5372, -5116, -4860, -4604, -4348, -4092, -3900, -3772, -3644,
    -3516, -3388, -3260, -3132, -3004, -2876, -2748, -2620, -2492, -2364, -2236, -2108, -1980, -1884,
    -1820, -1756, -1692, -1628, -1564, -1500, -1436, -1372, -1308, -1244, -1180, -1116, -1052, -988,
    -924, -876, -844, -812, -780, -748, -716, -684, -652, -620, -588, -556, -524, -492, -460, -428,
    -396, -372, -356, -340, -324, -308, -292, -276, -260, -244, -228, -212, -196, -180, -164, -148,
    -132, -120, -112, -104, -96, -88, -80, -72, -64, -56, -48, -40, -32, -24, -16, -8, 0, 32124,
    31100, 30076, 29052, 28028, 27004, 25980, 24956, 23932, 22908, 21884, 20860, 19836, 18812, 17788,
    16764, 15996, 15484, 14972, 14460, 13948, 13436, 12924, 12412, 11900, 11388, 10876, 10364, 9852,
    9340, 8828, 8316, 7932, 7676, 7420, 7164, 6908, 6652, 6396, 6140, 5884, 5628, 5372, 5116, 4860,
    4604, 4348, 4092, 3900, 3772, 3644, 3516, 3388, 3260, 3132, 3004, 2876, 2748, 2620, 2492, 2364,
    2236, 2108, 1980, 1884, 1820, 1756, 1692, 1628, 1564, 1500, 1436, 1372, 1308, 1244, 1180, 1116,
    1052, 988, 924, 876, 844, 812, 780, 748, 716, 684, 652, 620, 588, 556, 524, 492, 460, 428, 396,
    372, 356, 340, 324, 308, 292, 276, 260, 244, 228, 212, 196, 180, 164, 148, 132, 120, 112, 104, 96,
    88, 80, 72, 64, 56, 48, 40, 32, 24, 16, 8, 0,
  ];
  for (let i = 0; i < mulaw.length; i++) {
    pcm[i] = MULAW_DEBIAS_TABLE[mulaw[i] & 0xff];
  }
  return pcm;
}

/**
 * Downsample 16kHz PCM to 8kHz (take every 2nd sample).
 */
export function downsample16kTo8k(pcm: Int16Array): Int16Array {
  const out = new Int16Array(Math.floor(pcm.length / 2));
  for (let i = 0; i < out.length; i++) {
    out[i] = pcm[i * 2];
  }
  return out;
}
