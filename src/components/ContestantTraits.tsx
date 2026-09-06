/**
 * Le sexe et l'âge d'un candidat, en icônes.
 *
 * CE QUE LA SOURCE DIT, ET RIEN DE PLUS. La colonne du tableau porte `♀` ou
 * `♂` ; le domaine en garde `f`, `m`, `other` — ou `null` quand la source se
 * tait. Rien ne se devine d'après un prénom : une icône absente veut dire
 * « la source ne le dit pas », ce qui est une information, pas un oubli.
 *
 * L'ICÔNE NE PORTE PAS SEULE LE SENS. Chaque symbole a son texte pour les
 * lecteurs d'écran, et l'âge reste écrit en toutes lettres : un pictogramme
 * seul se lit mal, et pas du tout à la voix.
 */
import { Cake, Mars, NonBinary, Venus } from 'lucide-react';
import type { Contestant } from '../domain/referential';

const GENDER = {
  f: { Icon: Venus, label: 'femme' },
  m: { Icon: Mars, label: 'homme' },
  other: { Icon: NonBinary, label: 'autre' },
} as const;

interface Props {
  contestant: Contestant;
  /** Sur une fiche, les traits se lisent en plus grand. */
  size?: 'sm' | 'md';
}

export function ContestantTraits({ contestant, size = 'sm' }: Props) {
  const gender = contestant.gender ? GENDER[contestant.gender] : null;
  if (!gender && contestant.age === null) return null;

  const pixels = size === 'md' ? 18 : 14;

  return (
    <span className="traits" data-size={size}>
      {gender && (
        <span className="trait">
          <gender.Icon size={pixels} aria-hidden />
          <span className="sr-only">{gender.label}</span>
        </span>
      )}
      {contestant.age !== null && (
        <span className="trait">
          <Cake size={pixels} aria-hidden />
          <span>{contestant.age} ans</span>
        </span>
      )}
    </span>
  );
}
