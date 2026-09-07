import { describe, expect, it } from 'vitest';
// `?raw` de Vite plutôt que `node:fs` : ce dossier est du code de navigateur,
// son `tsconfig` n'a pas les types de Node, et les lui ajouter pour un seul
// test ferait entrer les globales de Node dans le typage de toute l'app.
import config from '../vite.config.ts?raw';
import html from '../index.html?raw';

/**
 * Le manifeste est écrit dans `vite.config.ts` et n'existe qu'après un build :
 * il n'y a rien à importer ici. On lit donc la SOURCE — c'est un contrôle
 * textuel, avec ce que ça suppose de fragile, mais il tient la seule chose qui
 * a échappé à tout le reste : une valeur juste dans le code et fausse à
 * l'écran d'un téléphone.
 */
const valeur = (cle: string): string | null =>
  new RegExp(`${cle}: '([^']*)'`).exec(config)?.[1] ?? null;

describe('le nom de l’application', () => {
  it('le raccourci de l’écran d’accueil porte le nom ENTIER', () => {
    // Sur un téléphone, le raccourci lit `short_name`, jamais `name`. Il a
    // annoncé « Mister & miss » — le nom amputé de ce qui l'identifie —
    // pendant toute la vie du dépôt. Un nom court n'a d'intérêt que s'il
    // reste un nom.
    expect(valeur('short_name')).toBe('Mister & miss Koh');
    expect(valeur('short_name')).toBe(valeur('name'));
  });

  it('et l’en-tête de page dit la même chose à iOS', () => {
    // iOS ignore le manifeste et lit cette balise : deux sources, un seul nom.
    expect(html).toContain(
      '<meta name="apple-mobile-web-app-title" content="Mister & miss Koh" />'
    );
  });
});
