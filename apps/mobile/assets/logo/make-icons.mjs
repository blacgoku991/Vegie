// Génère les icônes SmartSecure (logo n° 2 : bouclier + coche + étincelle, dégradé SmartFixx).
// Usage : node apps/mobile/assets/logo/make-icons.mjs
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = (f) => join(here, "..", f);

const gradient = `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#6A4DFF"/><stop offset="0.42" stop-color="#B23CF5"/><stop offset="0.85" stop-color="#FF6A3D"/>
</linearGradient>`;

// Glyphe blanc dessiné dans un carré de 1024, centré.
const glyph = `<g fill="none" stroke="#FFFFFF" stroke-width="58" stroke-linecap="round" stroke-linejoin="round">
  <path d="M512 250 C600 300 680 318 740 322 V520 C740 650 640 740 512 790 C384 740 284 650 284 520 V322 C344 318 424 300 512 250 Z"/>
  <path d="M415 522 L488 594 L615 462"/>
</g>
<path fill="#FFFFFF" d="M790 200 Q799 254 852 263 Q799 272 790 326 Q781 272 728 263 Q781 254 790 200 Z"/>`;

const svg = (body, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs>${defs}</defs>${body}</svg>`;

// Icône principale (iOS impose un carré plein, sans transparence ; il arrondit lui-même).
const icon = svg(`<rect width="1024" height="1024" fill="url(#g)"/>${glyph}`, gradient);
// Android adaptatif : fond = dégradé, premier plan = glyphe réduit dans la zone sûre (66 %).
const adaptiveBg = svg(`<rect width="1024" height="1024" fill="url(#g)"/>`, gradient);
const adaptiveFg = svg(`<g transform="translate(512 512) scale(0.72) translate(-512 -512)">${glyph}</g>`);
// Écran de démarrage : l'icône arrondie, posée sur le fond papier de l'app.
const splash = svg(`<rect width="1024" height="1024" rx="230" fill="url(#g)"/>${glyph}`, gradient);

writeFileSync(join(here, "smartsecure-icon.svg"), icon);
await sharp(Buffer.from(icon)).png().toFile(out("icon.png"));
await sharp(Buffer.from(adaptiveFg)).png().toFile(out("adaptive-icon.png"));
await sharp(Buffer.from(adaptiveBg)).png().toFile(out("adaptive-icon-background.png"));
await sharp(Buffer.from(splash)).png().toFile(out("splash.png"));
console.log("ok");
