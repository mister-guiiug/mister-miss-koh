/**
 * Une note lue par QUELQU'UN D'AUTRE que son auteur — lien de partage, profil
 * public —, derrière la limite anti-spoiler DU LECTEUR.
 *
 * L'en-tête reste visible (ce que vise la note, sa date) : il ne raconte rien
 * de la soirée. Le reste — étoiles, titre, texte — se masque dès que la note
 * a pu être écrite après ce que le lecteur a vu (`noteRevealEpisode`). Le
 * lecteur peut l'afficher quand même, pour cette note seulement : c'est son
 * choix, pas celui de l'auteur.
 */
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { formatDate } from '@mister-guiiug/dev-pwa-config/format';
import type { NoteTarget } from '../backend/notes';
import { labelOf, type NoteChoice } from '../domain/noteTargets';
import { stars } from '../domain/notesExport';
import { noteRevealEpisode } from '../domain/noteSpoiler';
import { useAppStore } from '../store/useAppStore';
import { SpoilerGuard } from './SpoilerGuard';

export interface ReadableNote {
  readonly id: string;
  readonly title: string | null;
  readonly body: string;
  readonly rating: number | null;
  readonly target: NoteTarget;
  readonly targetId: string;
  readonly updatedAt: string;
}

export function ReadNoteCard({
  note,
  choices,
}: {
  note: ReadableNote;
  choices: readonly NoteChoice[];
}) {
  const referential = useAppStore(s => s.referential);

  return (
    <Card>
      <CardHeader
        title={labelOf(choices, note.target, note.targetId)}
        subtitle={`modifiée le ${formatDate(note.updatedAt)}`}
      />
      <SpoilerGuard
        episodeNumber={noteRevealEpisode(referential, note)}
        message="Masqué : cette note a été écrite après ce que vous avez vu, elle pourrait en parler."
        advance={false}
        peek
      >
        {note.rating !== null && (
          <p className="rating" aria-label={`${note.rating} sur 5`}>
            <span aria-hidden>{stars(note.rating)}</span>
          </p>
        )}
        {note.title && <p className="note-title">{note.title}</p>}
        <p className="shared-body">{note.body}</p>
      </SpoilerGuard>
    </Card>
  );
}
