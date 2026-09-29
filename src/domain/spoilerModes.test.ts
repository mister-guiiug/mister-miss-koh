import { describe, expect, it } from 'vitest';
import { SPOILER_OPTIONS, spoilerStatus } from './spoilerModes';

describe('les réglages anti-spoiler', () => {
  it('le plus sûr vient en premier', () => {
    expect(SPOILER_OPTIONS.map(o => o.value)).toEqual([
      'hide_unwatched',
      'hide_future',
      'reveal_all',
    ]);
  });

  it('la pastille dit où l’on en est', () => {
    expect(spoilerStatus('hide_unwatched', 0).label).toBe(
      'Anti-spoiler · rien de vu'
    );
    expect(spoilerStatus('hide_unwatched', 4).label).toBe(
      'Anti-spoiler · vu jusqu’à l’ép. 4'
    );
    expect(spoilerStatus('hide_future', 4).label).toBe(
      'Anti-spoiler · jusqu’à la veille'
    );
  });

  it('« Tout voir » passe en avertissement : plus rien n’est protégé', () => {
    expect(spoilerStatus('reveal_all', 4)).toEqual({
      label: 'Tout voir · aucun masquage',
      tone: 'warning',
    });
    expect(spoilerStatus('hide_unwatched', 4).tone).toBe('info');
  });
});
