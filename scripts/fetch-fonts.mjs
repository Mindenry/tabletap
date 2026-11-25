import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const URL =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,400..700&display=swap';

const css = await (await fetch(URL, { headers: { 'user-agent': UA } })).text();
const out = join(process.cwd(), 'apps', 'web', 'app', 'fonts');
mkdirSync(out, { recursive: true });

const regex = /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g;
const faces = [];
let match;
while ((match = regex.exec(css))) {
  const subset = match[1];
  const body = match[2];
  const family = /font-family:\s*'([^']+)'/.exec(body)?.[1];
  const weight = /font-weight:\s*([^;]+);/.exec(body)?.[1]?.trim();
  const url = /src:\s*url\(([^)]+)\)/.exec(body)?.[1];
  if (family && weight && url) faces.push({ subset, family, weight, url });
}

const wanted = faces.filter(
  (face) =>
    (face.family === 'Fraunces' && face.subset === 'latin') ||
    (face.family === 'IBM Plex Sans Thai' && (face.subset === 'latin' || face.subset === 'thai')),
);

for (const face of wanted) {
  const name =
    face.family === 'Fraunces'
      ? 'fraunces-latin-variable.woff2'
      : `plex-thai-${face.subset}-${face.weight}.woff2`;
  const bytes = Buffer.from(await (await fetch(face.url)).arrayBuffer());
  writeFileSync(join(out, name), bytes);
  console.log(`${name} ${(bytes.length / 1024).toFixed(1)}KB`);
}
