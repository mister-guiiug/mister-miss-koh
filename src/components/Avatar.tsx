/**
 * Le portrait d'un candidat : sa photo si vous en avez rangé une, ses
 * initiales sinon.
 *
 * LE REPLI N'EST PAS UN TROU. Aucune photo n'est fournie avec l'application —
 * elle n'en distribue aucune, et n'en récupère aucune. Les initiales, posées
 * sur une teinte tirée de la palette maison et choisie d'après l'identifiant,
 * donnent à chaque candidat une vignette stable et reconnaissable, sans rien
 * emprunter à personne.
 *
 * L'image est DÉCORATIVE (`alt=""`) : le nom du candidat est toujours écrit
 * juste à côté, et le répéter ferait dire deux fois la même chose au lecteur
 * d'écran.
 */
import type { Contestant } from '../domain/referential';
import { usePhotosStore } from '../store/usePhotosStore';
import { initialsOf, tintOf } from './avatarInitials';

interface Props {
  contestant: Contestant;
  /** `sm` dans une liste, `lg` sur une fiche. */
  size?: 'sm' | 'lg';
}

export function Avatar({ contestant, size = 'sm' }: Props) {
  const url = usePhotosStore(s => s.urls[contestant.id]);

  if (url) {
    return (
      <img
        className="avatar"
        data-size={size}
        src={url}
        alt=""
        loading="lazy"
      />
    );
  }

  return (
    <span
      className="avatar avatar-initials"
      data-size={size}
      data-tint={tintOf(contestant.id)}
      aria-hidden="true"
    >
      {initialsOf(contestant.displayName)}
    </span>
  );
}
