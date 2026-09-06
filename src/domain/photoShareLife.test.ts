import { describe, expect, it } from 'vitest';
import { isAlive, remainingLabel } from './photoShareLife';

const maintenant = new Date('2026-09-06T12:00:00.000Z');
const dans = (ms: number) => new Date(maintenant.getTime() + ms).toISOString();

describe('ce qu’il reste à vivre à un partage', () => {
  it('arrondit vers le BAS — une promesse tenable', () => {
    // 1 h 59 rend « 1 h » : annoncer 2 h serait promettre ce qu'on n'a pas.
    expect(remainingLabel(dans(119 * 60_000), maintenant)).toBe('1 h');
    expect(remainingLabel(dans(24 * 3_600_000), maintenant)).toBe('24 h');
  });

  it('passe aux minutes sous l’heure, puis le dit en toutes lettres', () => {
    expect(remainingLabel(dans(59 * 60_000), maintenant)).toBe('59 min');
    expect(remainingLabel(dans(60_000), maintenant)).toBe('1 min');
    expect(remainingLabel(dans(30_000), maintenant)).toBe('moins d’une minute');
  });

  it('ne rend rien quand c’est fini — l’instant pile compris', () => {
    expect(remainingLabel(dans(0), maintenant)).toBeNull();
    expect(remainingLabel(dans(-1), maintenant)).toBeNull();
    expect(isAlive(dans(-1), maintenant)).toBe(false);
    expect(isAlive(dans(60_000), maintenant)).toBe(true);
  });

  it('une date illisible vaut « fini », jamais « pour toujours »', () => {
    // Un `NaN` qui traverserait une comparaison rendrait `false` partout et
    // ferait vivre le partage éternellement à l'écran.
    expect(remainingLabel('pas une date', maintenant)).toBeNull();
    expect(isAlive('pas une date', maintenant)).toBe(false);
  });
});
