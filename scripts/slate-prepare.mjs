// Builds .slate/: a self-contained copy of the web app that Zoho Catalyst Slate can build
// with plain npm on its own servers (Slate uploads the source folder and runs
// `npm install && npm run build`, so it can't use pnpm workspaces or apps/web directly).
//
//   pnpm slate:prepare && catalyst deploy --only slate:bookleaf-portal
//
// The shared workspace packages are copied in and referenced with `file:` dependencies.
// Only public NEXT_PUBLIC_* values are written; no .env.local, node_modules or build output.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'apps/web');
const out = join(root, '.slate');
// Created by `catalyst slate:link`; they link .slate to the Slate app, so keep them.
const KEEP = new Set(['.catalyst', 'cli-config.json']);

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

/** NEXT_PUBLIC_API_URL from the shell, else from apps/web/.env.production.local. */
function apiUrl() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  const file = join(web, '.env.production.local');
  const line = existsSync(file)
    ? readFileSync(file, 'utf8')
        .split('\n')
        .find((l) => l.startsWith('NEXT_PUBLIC_API_URL='))
    : undefined;
  if (!line) {
    throw new Error(
      'Set NEXT_PUBLIC_API_URL, or add it to apps/web/.env.production.local, before preparing Slate.',
    );
  }
  return line.slice('NEXT_PUBLIC_API_URL='.length).trim();
}

const url = apiUrl().replace(/\/+$/, '');

mkdirSync(out, { recursive: true });
for (const entry of readdirSync(out)) {
  if (!KEEP.has(entry)) rmSync(join(out, entry), { recursive: true, force: true });
}

for (const entry of ['src', 'public', 'next.config.ts', 'postcss.config.mjs']) {
  cpSync(join(web, entry), join(out, entry), { recursive: true });
}

for (const name of ['contracts', 'utils']) {
  const dest = join(out, 'packages', name);
  cpSync(join(root, 'packages', name, 'src'), join(dest, 'src'), { recursive: true });
  const pkg = readJson(join(root, 'packages', name, 'package.json'));
  delete pkg.devDependencies;
  delete pkg.scripts;
  writeJson(join(dest, 'package.json'), pkg);
}

mkdirSync(join(out, 'config'), { recursive: true });
for (const file of ['base.json', 'nextjs.json']) {
  cpSync(join(root, 'packages/config/tsconfig', file), join(out, 'config', file));
}

const pkg = readJson(join(web, 'package.json'));
pkg.name = 'bookleaf-portal';
pkg.dependencies['@bookleaf/contracts'] = 'file:./packages/contracts';
pkg.dependencies['@bookleaf/utils'] = 'file:./packages/utils';
for (const dev of ['@bookleaf/config', 'eslint', 'eslint-config-next', 'vitest']) {
  delete pkg.devDependencies[dev];
}
pkg.scripts = { dev: 'next dev', build: 'next build', start: 'next start' };
writeJson(join(out, 'package.json'), pkg);

const tsconfig = readJson(join(web, 'tsconfig.json'));
tsconfig.extends = './config/nextjs.json';
writeJson(join(out, 'tsconfig.json'), tsconfig);

writeFileSync(join(out, '.env.production'), `NEXT_PUBLIC_API_URL=${url}\n`);

if (!existsSync(join(out, '.catalyst/slate-config.toml'))) {
  console.warn('Note: .slate is not linked to Slate yet (no .catalyst/slate-config.toml).');
}
console.log(`.slate ready (API: ${url}). Deploy: catalyst deploy --only slate:bookleaf-portal`);
