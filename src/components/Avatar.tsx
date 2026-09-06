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
 *
 * ON PEUT L'AGRANDIR, MAIS PAS PARTOUT. `zoomable` n'est posé que sur la
 * fiche : dans une liste, la vignette est à côté d'un lien qui mène à cette
 * fiche, et lui donner un autre geste ferait deux cibles pour deux
 * destinations à trois pixels l'une de l'autre. Et jamais sur des initiales —
 * il n'y a rien à voir de plus grand.
 */
import { useState } from 'react';
import { Sheet } from '@mister-guiiug/dev-pwa-config/react/sheet';
import type { Contestant } from '../domain/referential';
import { usePhotosStore } from '../store/usePhotosStore';
import { initialsOf, tintOf } from './avatarInitials';

interface Props {
  contestant: Contestant;
  /** `sm` dans une liste, `lg` sur une fiche. */
  size?: 'sm' | 'lg';
  /** Cliquer la photo l'ouvre en grand. Sans effet sur des initiales. */
  zoomable?: boolean;
}

export function Avatar({ contestant, size = 'sm', zoomable = false }: Props) {
  const url = usePhotosStore(s => s.urls[contestant.id]);
  const [zoom, setZoom] = useState(false);

  if (!url) {
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

  const image = (
    <img className="avatar" data-size={size} src={url} alt="" loading="lazy" />
  );

  if (!zoomable) return image;

  return (
    <>
      <button
        type="button"
        className="avatar-zoom"
        onClick={() => setZoom(true)}
        aria-label={`Voir la photo de ${contestant.displayName} en grand`}
      >
        {image}
      </button>
      {zoom && (
        <Sheet
          open
          title={`Photo de ${contestant.displayName}`}
          closeLabel="Fermer"
          onClose={() => setZoom(false)}
        >
          {/* `alt=""` ici AUSSI : le titre de la feuille nomme déjà la photo,
              et le lecteur d'écran l'annonce en ouvrant le dialogue. */}
          <img className="photo-zoom" src={url} alt="" />
        </Sheet>
      )}
    </>
  );
}
