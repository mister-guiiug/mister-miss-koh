import { describe, expect, it } from 'vitest';
import { DEMO_REFERENTIAL } from '../backend/demo';
import {
  PARALLELE_MAX,
  fileDesPortraits,
  fileNettoyee,
  prochainsAConfier,
} from './portraitQueue';

const ref = DEMO_REFERENTIAL;
const ids = ref.contestants.map(c => c.id);

describe('la file des portraits', () => {
  it('suit l’ordre du RÉFÉRENTIEL, pas celui du dépôt', () => {
    // Les portraits sont rangés dans IndexedDB au fil des dépôts ; les
    // proposer dans cet ordre-là donnerait une suite qui n'a de sens pour
    // personne.
    const desordre = [ids[2]!, ids[0]!, ids[1]!];
    expect(fileDesPortraits(ref, desordre, [])).toEqual([
      ids[0]!,
      ids[1]!,
      ids[2]!,
    ]);
  });

  it('n’enfile que ceux dont on a un portrait', () => {
    expect(fileDesPortraits(ref, [ids[1]!], [])).toEqual([ids[1]!]);
    expect(fileDesPortraits(ref, [], [])).toEqual([]);
  });

  it('saute ceux qui ont DÉJÀ un lien vivant', () => {
    // Sans quoi la tournée créerait un second lien pour la même personne, et
    // le premier — peut-être déjà donné — serait chassé par le glissement.
    expect(fileDesPortraits(ref, [ids[0]!, ids[1]!], [ids[0]!])).toEqual([
      ids[1]!,
    ]);
  });
});

describe('les places libres', () => {
  it('ne remplit QUE ce que le serveur peut porter', () => {
    // Le sixième lien n'est pas refusé par le serveur : il chasse le plus
    // ancien. Créer au-delà tuerait un lien déjà donné, en silence.
    const file = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(prochainsAConfier(file, 0)).toHaveLength(PARALLELE_MAX);
    expect(prochainsAConfier(file, 3)).toEqual(['a', 'b']);
    expect(prochainsAConfier(file, PARALLELE_MAX)).toEqual([]);
  });

  it('ne rend rien quand le serveur en porte déjà plus que la borne', () => {
    // Cas réel : des liens créés depuis des fiches, hors tournée. Un calcul
    // naïf rendrait un nombre NÉGATIF de places, et `slice` s'en accommode
    // en coupant par la fin — donc en confiant le mauvais portrait.
    expect(prochainsAConfier(['a', 'b'], 7)).toEqual([]);
  });

  it('respecte l’ordre : la file avance par le début', () => {
    expect(prochainsAConfier(['a', 'b', 'c'], 4)).toEqual(['a']);
  });
});

describe('le nettoyage de la file', () => {
  it('retire ce qui est parti', () => {
    expect(fileNettoyee(['a', 'b', 'c'], ['a'], ['a', 'b', 'c'])).toEqual([
      'b',
      'c',
    ]);
  });

  it('retire aussi ce qui n’a PLUS de portrait', () => {
    // Un portrait effacé de l'appareil pendant que sa place attendait
    // bloquerait la file derrière lui à chaque tour de relevé.
    expect(fileNettoyee(['a', 'b', 'c'], [], ['a', 'c'])).toEqual(['a', 'c']);
  });

  it('ne réordonne rien', () => {
    expect(fileNettoyee(['c', 'a', 'b'], [], ['a', 'b', 'c'])).toEqual([
      'c',
      'a',
      'b',
    ]);
  });
});
