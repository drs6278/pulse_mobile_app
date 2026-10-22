// Generated from src/lib/schedule/import/utf8.ts; regenerate with prepare-delivery.mjs.
// Works in Hermes, browsers, and Edge Functions without a TextEncoder polyfill.
export function utf8Bytes(text) {
    const bytes = [];
    for (const character of text) {
        let point = character.codePointAt(0);
        if (point >= 0xd800 && point <= 0xdfff)
            point = 0xfffd;
        if (point < 0x80)
            bytes.push(point);
        else if (point < 0x800)
            bytes.push(0xc0 | (point >> 6), 0x80 | (point & 63));
        else if (point < 0x10000)
            bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 63), 0x80 | (point & 63));
        else
            bytes.push(0xf0 | (point >> 18), 0x80 | ((point >> 12) & 63), 0x80 | ((point >> 6) & 63), 0x80 | (point & 63));
    }
    return new Uint8Array(bytes);
}
