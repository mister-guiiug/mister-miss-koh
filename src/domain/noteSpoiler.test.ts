import { describe, expect, it } from 'vitest';
import { noteRevealEpisode, type NoteDating } from './noteSpoiler';
import { DEMO_REFERENTIAL } from '../backend/demo';

// Démonstration : épisode 1 le 25/08, épisode 2 le 01/09, le 3 à venir.
const note = (over: Partial<NoteDating> = {}): NoteDating => ({
  target: 'season_contestant',
  targetId: 'c-ael',
  updatedAt: '2026-08-28T20:00:00.000Z',
  ...over,
});

describe('noteRevealEpisode — jusqu’où une note peut parler', () => {
  it('une note sur un candidat parle de tout ce qui était diffusé à sa date', () => {
    expect(noteRevealEpisode(DEMO_REFERENTIAL, note())).toBe(1);
    expect(
      noteRevealEpisode(
        DEMO_REFERENTIAL,
        note({ updatedAt: '2026-09-01T21:30:00.000Z' })
      )
    ).toBe(2);
  });

  it('écrite avant la première diffusion, elle ne peut rien révéler', () => {
    expect(
      noteRevealEpisode(
        DEMO_REFERENTIAL,
        note({ updatedAt: '2026-08-01T10:00:00.000Z' })
      )
    ).toBe(0);
  });

  it('une note sur un épisode vaut au moins cet épisode…', () => {
    expect(
      noteRevealEpisode(
        DEMO_REFERENTIAL,
        note({
          target: 'episode',
          targetId: 'e2',
          updatedAt: '2026-08-01T10:00:00.000Z',
        })
      )
    ).toBe(2);
  });

  it('…et plus, si elle a été modifiée après un épisode suivant', () => {
    expect(
      noteRevealEpisode(
        DEMO_REFERENTIAL,
        note({
          target: 'episode',
          targetId: 'e1',
          updatedAt: '2026-09-05T10:00:00.000Z',
        })
      )
    ).toBe(2);
  });

  it('sans référentiel, on ne sait pas : `null`, que le garde masque', () => {
    expect(noteRevealEpisode(null, note())).toBeNull();
  });
});
