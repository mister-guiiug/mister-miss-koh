import { describe, expect, it } from 'vitest';
import { isSpoiler, isWatched, lastWatched, spoilerLimit } from './spoiler';
import type { Episode } from './referential';

const ep = (
  number: number,
  airDate: string | null,
  aired: boolean
): Episode => ({
  id: `e${number}`,
  number,
  airDate,
  aired,
  comfortWinnerIds: [],
  immunityWinnerIds: [],
  comfortWinnerTeamIds: [],
  immunityWinnerTeamIds: [],
});

const episodes = [
  ep(1, '2026-08-25', true),
  ep(2, '2026-09-01', true),
  ep(3, '2026-09-08', false),
];

describe('spoilerLimit', () => {
  it('« tout voir » ne masque rien', () => {
    expect(
      spoilerLimit({
        mode: 'reveal_all',
        watched: new Set(),
        today: '2026-09-05',
        episodes,
      })
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it('« masquer le non vu » suit le dernier épisode marqué, et vaut 0 sans aucun', () => {
    expect(
      spoilerLimit({
        mode: 'hide_unwatched',
        watched: new Set(),
        today: '2026-09-05',
        episodes,
      })
    ).toBe(0);
    expect(
      spoilerLimit({
        mode: 'hide_unwatched',
        watched: new Set([1, 2]),
        today: '2026-09-05',
        episodes,
      })
    ).toBe(2);
  });

  it('« masquer le futur » s’arrête à la VEILLE : un épisode du jour est encore un spoiler', () => {
    expect(
      spoilerLimit({
        mode: 'hide_future',
        watched: new Set(),
        today: '2026-09-05',
        episodes,
      })
    ).toBe(2);
    expect(
      spoilerLimit({
        mode: 'hide_future',
        watched: new Set(),
        today: '2026-09-01',
        episodes,
      })
    ).toBe(1);
  });

  it('un épisode non diffusé ne compte jamais, même daté', () => {
    expect(
      spoilerLimit({
        mode: 'hide_future',
        watched: new Set(),
        today: '2026-12-31',
        episodes,
      })
    ).toBe(2);
  });
});

describe('isSpoiler', () => {
  it('au-delà de la limite, c’est un spoiler', () => {
    expect(isSpoiler(3, 2)).toBe(true);
    expect(isSpoiler(2, 2)).toBe(false);
  });

  it('un épisode inconnu est masqué dès que la limite est finie', () => {
    expect(isSpoiler(null, 2)).toBe(true);
    expect(isSpoiler(null, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('« vu », c’est « j’en suis là »', () => {
  it('en être au cinquième, c’est avoir vu les quatre premiers', () => {
    const vus = [5];
    expect(isWatched(1, vus)).toBe(true);
    expect(isWatched(5, vus)).toBe(true);
    expect(isWatched(6, vus)).toBe(false);
  });

  it('rien de coché, rien de vu', () => {
    expect(isWatched(1, [])).toBe(false);
    expect(lastWatched([])).toBe(0);
  });

  it('la limite anti-spoiler et le bouton disent la même chose', () => {
    // C'ÉTAIT LE DÉFAUT : la limite prenait le maximum, le bouton lisait
    // l'appartenance. Un épisode pouvait donc être « pas vu » à l'écran et
    // traité comme vu par l'anti-spoiler.
    const vus = [2, 5];
    expect(lastWatched(vus)).toBe(5);
    expect(isWatched(4, vus)).toBe(true);
  });
});
