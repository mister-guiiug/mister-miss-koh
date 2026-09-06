/**
 * L'étoile des favoris, la même partout : icône seule dans la liste, libellée
 * sur la fiche.
 *
 * Elle ÉCLATE à l'ajout — une image-clé jouée une fois, portée par `data-pop`
 * le temps de l'animation. Jamais au montage : une étoile déjà remplie n'a
 * rien à annoncer quand on revient sur la liste, et chaque écran se remonte à
 * la navigation. Le retrait, lui, ne fait rien de plus que se vider.
 */
import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { useHaptics } from '../hooks/useHaptics';

interface Props {
  /** Le prénom, pour nommer l'action au lecteur d'écran. */
  name: string;
  favorite: boolean;
  onToggle: () => void;
  /** Avec un libellé visible (fiche) plutôt qu'une icône seule (liste). */
  labelled?: boolean;
}

export function FavoriteButton({
  name,
  favorite,
  onToggle,
  labelled = false,
}: Props) {
  const [pop, setPop] = useState(false);
  const haptics = useHaptics();

  const common = {
    size: 'sm',
    className: 'fav',
    // L'éclat n'existe que sur une étoile pleine : un retrait le range sans
    // attendre `animationend`, qu'un réglage peut avoir neutralisé.
    'data-pop': pop && favorite ? '' : undefined,
    'aria-pressed': favorite,
    onClick: () => {
      if (!favorite) {
        setPop(true);
        haptics('favorite');
      }
      onToggle();
    },
    onAnimationEnd: () => setPop(false),
  } as const;

  const star = (
    <Star size={18} aria-hidden fill={favorite ? 'currentColor' : 'none'} />
  );

  // Libellée : le texte visible suffit pour nom — un nom qui ne le
  // contiendrait pas trahirait la commande vocale.
  if (labelled) {
    return (
      <Button {...common} variant={favorite ? 'primary' : 'outline'}>
        {star}
        <span>{favorite ? 'Favori' : 'Ajouter aux favoris'}</span>
      </Button>
    );
  }

  // Icône seule : le nom dit l'action, et le socle l'exige.
  return (
    <Button
      {...common}
      variant="ghost"
      iconOnly
      aria-label={
        favorite ? `Retirer ${name} des favoris` : `Ajouter ${name} aux favoris`
      }
    >
      {star}
    </Button>
  );
}
