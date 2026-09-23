import { describe, expect, it } from 'vitest';
import {
  colourName,
  comebacksOf,
  episodeOfDay,
  teamAt,
  tribesSeenAt,
} from './tribes';
import { inGame } from './stats';
import { groupingAt } from './pairing';
import { contestantById, type Referential } from './referential';
import { SAISON_AUX_TRIBUS as S } from '../test/saisonAuxTribus';

const who = (id: string) => {
  const c = contestantById(S, id);
  if (!c) throw new Error(id);
  return c;
};
const tribu = (ref: Referential, id: string, limit: number) =>
  teamAt(ref, who(id), limit)?.name ?? null;

describe('un jour de jeu se montre avec l’épisode de son conseil', () => {
  it('le jour 9 appartient à l’épisode 4 : le 3 s’arrête au jour 8', () => {
    expect(episodeOfDay(S, 1)).toBe(1);
    expect(episodeOfDay(S, 3)).toBe(1);
    expect(episodeOfDay(S, 9)).toBe(4);
    expect(episodeOfDay(S, 14)).toBe(5);
    // Après le dernier conseil connu, personne ne peut le dire.
    expect(episodeOfDay(S, 15)).toBeNull();
  });

  it('un jour de conseil inconnu RETARDE la révélation, jamais ne l’avance', () => {
    const sansJours: Referential = {
      ...S,
      episodes: S.episodes.map(e =>
        e.number === 3 || e.number === 4 ? { ...e, councilDay: null } : e
      ),
    };
    expect(episodeOfDay(sansJours, 9)).toBe(5);
    expect(tribu(sansJours, 'c-aurore', 4)).toBe('Tribu unique');
    expect(tribu(sansJours, 'c-aurore', 5)).toBe('Kalima');
  });
});

describe('la tribu À LA LIMITE', () => {
  it('à qui n’a vu que l’épisode 3, la tribu jaune n’existe pas encore', () => {
    expect(tribu(S, 'c-aurore', 3)).toBe('Tribu unique');
    expect(tribu(S, 'c-aurore', 4)).toBe('Kalima');
  });

  it('deux séjours ouverts : le plus tardif l’emporte', () => {
    expect(tribu(S, 'c-victor', 4)).toBe('Kalima');
  });

  it('rien avant le premier épisode vu', () => {
    expect(teamAt(S, who('c-aurore'), 0)).toBeNull();
  });

  it('un sorti reste avec la dernière tribu où on l’a vu', () => {
    expect(tribu(S, 'c-jonas', 5)).toBe('Tribu unique');
    expect(tribu(S, 'c-chloe', 5)).toBe('Kalima');
  });
});

describe('en jeu : on sort, on revient, on ressort', () => {
  const enJeu = (limit: number) => inGame(S, limit).sort();

  it('épisode 3 : trois sortis', () => {
    expect(enJeu(3)).toEqual(['c-aurore', 'c-ugo', 'c-victor']);
  });

  it('épisode 4 : le sorti du premier conseil est REVENU, et la sortie du 3 aussi', () => {
    expect(enJeu(4)).toEqual([
      'c-aurore',
      'c-chloe',
      'c-mael',
      'c-ugo',
      'c-victor',
    ]);
  });

  it('épisode 5 : la revenue ressort', () => {
    expect(enJeu(5)).not.toContain('c-chloe');
    expect(enJeu(5)).toContain('c-mael');
  });

  it('sans sa seconde sortie publiée, le séjour refermé au jour 14 la sort quand même', () => {
    // Une base publiée avant 0028 n'a qu'UNE sortie par candidat. Le séjour
    // « Kalima (jour 9 – 14) » suffit à dire qu'elle n'est plus là au 5.
    const avant0028: Referential = {
      ...S,
      departures: S.departures.filter(
        d => !(d.contestantId === 'c-chloe' && d.episodeNumber === 5)
      ),
    };
    expect(inGame(avant0028, 4)).toContain('c-chloe');
    expect(inGame(avant0028, 5)).not.toContain('c-chloe');
  });

  it('battu à l’arène : une seconde sortie ne le fait pas revenir', () => {
    expect(inGame(S, 5)).not.toContain('c-jonas');
    expect(comebacksOf(S, who('c-jonas'))).toEqual([]);
  });

  it('les retours se datent à l’épisode qui les montre, dans leur tribu', () => {
    expect(
      comebacksOf(S, who('c-mael')).map(b => [b.episodeNumber, b.team?.name])
    ).toEqual([[4, 'Sorako']]);
    expect(
      comebacksOf(S, who('c-chloe')).map(b => [b.episodeNumber, b.fromDay])
    ).toEqual([[4, 9]]);
  });
});

describe('quand regrouper par tribu', () => {
  it('par duo tant qu’une seule tribu se montre, par tribu dès qu’il y en a deux', () => {
    expect(tribesSeenAt(S, 3)).toBe(1);
    expect(groupingAt(S, [], 3)).toBe('pair');
    expect(tribesSeenAt(S, 4)).toBe(3);
    expect(groupingAt(S, [], 4)).toBe('team');
  });

  it('une supposition de duo ne défait pas des tribus formées', () => {
    expect(groupingAt(S, [{ memberIds: ['c-aurore', 'c-ugo'] }], 4)).toBe(
      'team'
    );
  });
});

describe('le nom d’une couleur de tribu', () => {
  it('se calcule sur la teinte, accordé à « tribu »', () => {
    // Les couleurs relevées sur les dix-huit pages le 23/09/2026.
    expect(colourName('#fee347')).toBe('jaune');
    expect(colourName('#fc5d5d')).toBe('rouge');
    expect(colourName('#5dadec')).toBe('bleue');
    expect(colourName('#f39442')).toBe('orange');
    expect(colourName('#5dce5d')).toBe('verte');
    expect(colourName('#b25080')).toBe('rose');
  });

  it('un blanc, un noir, un gris n’en ont pas : tribu réunifiée, statut', () => {
    expect(colourName('#ffffff')).toBeNull();
    expect(colourName('#000000')).toBeNull();
    expect(colourName('#808080')).toBeNull();
    expect(colourName('#a9a9a9')).toBeNull();
  });

  it('ce qui n’est pas une couleur n’a pas de nom', () => {
    expect(colourName(null)).toBeNull();
    expect(colourName('rouge')).toBeNull();
    expect(colourName('#FEE347')).toBeNull();
  });
});
