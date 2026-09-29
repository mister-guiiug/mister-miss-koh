/**
 * Masque ce qui dépasse la limite anti-spoiler, et le DIT.
 *
 * Un contenu masqué qui ne se signale pas passe pour absent. Le garde le dit,
 * SANS NOMMER L'ÉPISODE : « à l'épisode 5 » apprenait déjà qu'il s'était passé
 * quelque chose ce soir-là. Le bouton n'avance QUE D'UN ÉPISODE — marquer le 5
 * alors qu'on en est à 0 révélait tout d'un coup, parce que la limite est le
 * maximum des épisodes cochés.
 *
 * LA SILHOUETTE EST LA MÊME POUR TOUS. Avec `rows`, le garde dessine les
 * libellés de ce qu'il cache (Confort, Immunité, Conseil) suivis de barres
 * GIVRÉES — de largeurs fixes, identiques d'un épisode à l'autre. Jamais le
 * vrai texte flouté : il resterait lisible au lecteur d'écran, à la sélection,
 * et à l'œil pour un prénom court. Et jamais une forme qui suive le contenu :
 * un épisode sans conseil ou à deux départs se reconnaîtrait à sa hauteur.
 */
import { Fragment, useState, type CSSProperties, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { isSpoiler } from '../domain/spoiler';
import { lastAiredEpisode } from '../domain/referential';
import { useAppStore } from '../store/useAppStore';
import { useSpoilerLimit } from '../hooks/useSpoilerLimit';

/** Des largeurs fixes, pas celles du contenu : la silhouette ne dit rien. */
const FROST_WIDTHS = ['64%', '46%', '78%'] as const;

interface Props {
  episodeNumber: number | null;
  children: ReactNode;
  /** Plusieurs faits masqués d'un coup : un seul bandeau, pas une pile. */
  count?: number;
  /** Les libellés de ce qui est caché, dessinés au-dessus de barres givrées. */
  rows?: readonly string[];
  /** Remplace la phrase par défaut — elle doit commencer par « Masqué ». */
  message?: string;
  /** Propose « Avancer d’un épisode » (vrai par défaut). */
  advance?: boolean;
  /**
   * Propose « Afficher quand même », pour CE contenu seulement et sans toucher
   * au suivi : le lecteur d'une note partagée décide pour lui.
   */
  peek?: boolean;
}

export function SpoilerGuard({
  episodeNumber,
  children,
  count = 1,
  rows,
  message,
  advance = true,
  peek = false,
}: Props) {
  const limit = useSpoilerLimit();
  const referential = useAppStore(s => s.referential);
  const toggleWatched = useAppStore(s => s.toggleWatched);
  const [peeked, setPeeked] = useState(false);
  const spoiler = isSpoiler(episodeNumber, limit) && !peeked;

  // Ce que le garde montrait AU RENDU PRÉCÉDENT. Un contenu qui vient d'être
  // démasqué entre en mouvement (`.reveal`) ; un contenu visible au montage
  // reste en place — l'écran, lui, a déjà fait son entrée, et il se remonte à
  // chaque navigation. Motif de la documentation React (« storing information
  // from previous renders ») : l'état est corrigé pendant le rendu, sous
  // condition, et React rejoue le rendu avant de peindre quoi que ce soit.
  const [previous, setPrevious] = useState({ spoiler, revealed: false });
  if (previous.spoiler !== spoiler) {
    setPrevious({ spoiler, revealed: previous.spoiler && !spoiler });
  }

  if (!spoiler) {
    return previous.revealed ? (
      <div className="reveal">{children}</div>
    ) : (
      <>{children}</>
    );
  }

  const text =
    message ??
    (count > 1
      ? `Masqué : ${count} faits se passent après ce que vous avez vu.`
      : 'Masqué : cela se passe après ce que vous avez vu.');
  const canAdvance =
    advance &&
    referential !== null &&
    Number.isFinite(limit) &&
    limit + 1 <= lastAiredEpisode(referential);

  return (
    <div
      className="spoiler"
      role="group"
      aria-label="Contenu masqué (anti-spoiler)"
    >
      {rows && (
        <dl className="stats spoiler-rows" aria-hidden>
          {rows.map((label, index) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd>
                <span
                  className="frost"
                  style={
                    {
                      '--frost': FROST_WIDTHS[index % FROST_WIDTHS.length],
                    } as CSSProperties
                  }
                />
              </dd>
            </Fragment>
          ))}
        </dl>
      )}
      <p className="spoiler-text">
        <Lock size={16} aria-hidden className="spoiler-lock" />
        {text}
      </p>
      {(canAdvance || peek) && (
        <div className="spoiler-actions">
          {canAdvance && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleWatched(limit + 1)}
            >
              Avancer d’un épisode
            </Button>
          )}
          {peek && (
            <Button variant="ghost" size="sm" onClick={() => setPeeked(true)}>
              Afficher quand même
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
