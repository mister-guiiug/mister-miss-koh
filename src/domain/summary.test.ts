import { describe, expect, it } from 'vitest';
import { homeFigures } from './summary';
import { inGame, lastAiredEpisode } from './stats';
import { DEMO_REFERENTIAL } from '../backend/demo';

const AIRED = lastAiredEpisode(DEMO_REFERENTIAL);

describe('les chiffres de l’accueil', () => {
  it('sans référentiel, tout vaut zéro plutôt que rien', () => {
    // L'accueil se rend avant que quoi que ce soit soit chargé : une valeur
    // manquante y ferait un trou, pas une information.
    expect(homeFigures(null, ['x'], [1, 2], 99)).toEqual({
      contestants: 0,
      inGame: 0,
      favorites: 0,
      aired: 0,
      watched: 0,
      upTo: 0,
    });
  });

  it('compte « en jeu » À LA LIMITE anti-spoiler, jamais au-delà', () => {
    // C'est le seul chiffre dont l'oubli serait invisible : l'accueil est la
    // première chose qu'on voit, et « 5 en jeu » sur une saison regardée
    // jusqu'à l'épisode 1 annoncerait tous les départs d'un coup.
    const large = homeFigures(DEMO_REFERENTIAL, [], [], 99);
    const serre = homeFigures(DEMO_REFERENTIAL, [], [], 1);

    expect(large.inGame).toBe(inGame(DEMO_REFERENTIAL, AIRED).length);
    expect(serre.inGame).toBe(inGame(DEMO_REFERENTIAL, 1).length);
    expect(serre.inGame).toBeGreaterThanOrEqual(large.inGame);
    // La limite affichée ne dépasse jamais ce qui est diffusé.
    expect(large.upTo).toBe(AIRED);
    expect(serre.upTo).toBe(1);
  });

  it('ne compte que les favoris de CETTE saison', () => {
    // Le rapport « N sur M candidats » doit tenir : un favori posé ailleurs
    // ferait dépasser le compte sans qu'on comprenne pourquoi.
    const connu = DEMO_REFERENTIAL.contestants[0]?.id ?? '';
    const f = homeFigures(DEMO_REFERENTIAL, [connu, 'venu-d-ailleurs'], [], 99);

    expect(f.favorites).toBe(1);
    expect(f.contestants).toBe(DEMO_REFERENTIAL.contestants.length);
  });

  it('ne compte comme vus que des épisodes DIFFUSÉS', () => {
    // Un cochage sur un épisode à venir — ou un numéro aberrant resté dans
    // les données personnelles — gonflerait le total sans rien dire de vrai.
    const f = homeFigures(DEMO_REFERENTIAL, [], [1, AIRED + 5, 0, -3], 99);

    expect(f.aired).toBe(AIRED);
    expect(f.watched).toBe(1);
  });

  it('tous les diffusés vus : le compte les rejoint, sans les dépasser', () => {
    const tous = Array.from({ length: AIRED }, (_, i) => i + 1);
    const f = homeFigures(DEMO_REFERENTIAL, [], tous, 99);

    expect(f.watched).toBe(AIRED);
  });
});
