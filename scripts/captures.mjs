#!/usr/bin/env node
/**
 * Les captures de la fiche d'installation, prises sur l'application RÉELLE.
 *
 * Une illustration dessinée ferait une belle vignette et une promesse fausse :
 * ce que le magasin d'applications montre doit être ce que l'utilisateur
 * verra. Playwright ouvre donc le serveur de développement — celui qui lit la
 * base hébergée — coche les épisodes vus PAR L'INTERFACE, et photographie.
 *
 * Prérequis : `npm run dev` sur le port 5236.
 * Lancement : `node scripts/captures.mjs`
 *
 * L'ADRESSE EST PARAMÉTRABLE, et il le fallait : le chemin de base vaut
 * `/mister-miss-koh/` au build et `/` en développement (voir `vite.config.ts`).
 * Le script visait la première sur un serveur qui sert la seconde — il ne
 * pouvait donc plus tourner du tout. `CAPTURES_BASE` tranche, et le défaut
 * reste ce que rend `npm run dev`.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../public/screenshots'
);
mkdirSync(OUT, { recursive: true });

const base = process.env.CAPTURES_BASE ?? 'http://localhost:5236/';
const browser = await chromium.launch();

/** Marque les épisodes vus PAR L'INTERFACE : aucune supposition sur le stockage. */
async function revealEpisodes(page) {
  await page.goto(base + '#/episodes', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const boxes = page.locator('input[type="checkbox"]');
  const n = await boxes.count();
  for (let i = 0; i < n; i += 1) {
    const box = boxes.nth(i);
    if (!(await box.isChecked())) await box.check();
  }
  await page.waitForTimeout(400);
}

for (const [name, width, height, hash] of [
  ['etroit', 390, 844, '#/episodes'],
  ['large', 1280, 800, '#/candidats'],
]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await revealEpisodes(page);
  if (hash !== '#/episodes') {
    await page.goto(base + hash, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`${name}.png ${width}×${height}`);
  await page.close();
}

await browser.close();
