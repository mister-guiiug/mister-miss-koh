/**
 * Ce qu'un lien de partage ouvre — pour n'importe qui, sans compte.
 *
 * AUCUNE SESSION N'EST DEMANDÉE. La lecture passe par une fonction
 * `security definer` du serveur, appelée avec le rôle `anon` ; c'est elle qui
 * valide le jeton, refuse ce qui est révoqué ou expiré, et ne rend que des
 * colonnes choisies — jamais l'identifiant de l'auteur.
 *
 * UN SEUL MESSAGE POUR TROIS ÉCHECS. Inexistant, révoqué, expiré : le serveur
 * répond la même chose aux trois, et cet écran le répète tel quel. Les
 * distinguer dirait à un curieux qu'un jeton a existé.
 *
 * LES NOMS VIENNENT DU RÉFÉRENTIEL PUBLIC, pas du partage. Le serveur rend une
 * cible et son identifiant ; c'est le référentiel déjà chargé qui la nomme. S'il
 * ne la connaît pas — l'application tourne sur la démonstration, ou la ligne a
 * été retirée —, on l'écrit plutôt que d'inventer un nom.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { formatDate } from '@mister-guiiug/dev-pwa-config/format';
import { useAppStore } from '../../store/useAppStore';
import { sharingRepository, type SharedNote } from '../../backend/sharing';
import { labelOf, noteChoices } from '../../domain/noteTargets';
import { stars } from '../../domain/notesExport';

type State =
  | { step: 'loading' }
  | { step: 'ready'; notes: SharedNote[] }
  | { step: 'failed'; message: string };

/**
 * L'adresse est-elle seulement un partage ? La question se tranche AU RENDU,
 * pas dans un effet : un `setState` synchrone dans un effet fait un rendu de
 * plus pour dire ce qu'on savait déjà en lisant l'URL.
 */
export function SharedNotesScreen() {
  const { kind, token } = useParams();
  if (!token || (kind !== 'note' && kind !== 'notes')) {
    return (
      <div className="stack">
        <h2>Notes partagées</h2>
        <EmptyState
          title="Ce lien n’ouvre rien"
          description="Cette adresse n’est pas celle d’un partage."
          action={<Link to="/">Aller à l’accueil</Link>}
        />
      </div>
    );
  }
  return <SharedNotes kind={kind} token={token} />;
}

function SharedNotes({
  kind,
  token,
}: {
  kind: 'note' | 'notes';
  token: string;
}) {
  const referential = useAppStore(s => s.referential);
  const [state, setState] = useState<State>({ step: 'loading' });

  useEffect(() => {
    let alive = true;
    const read =
      kind === 'note'
        ? sharingRepository.readNote(token)
        : sharingRepository.readCollection(token);
    read
      .then(notes => {
        if (alive) setState({ step: 'ready', notes });
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        setState({
          step: 'failed',
          message:
            cause instanceof Error
              ? cause.message
              : 'Ce lien ne mène à rien — il a peut-être été révoqué.',
        });
      });
    return () => {
      alive = false;
    };
  }, [kind, token]);

  const choices = noteChoices(referential);
  const author =
    state.step === 'ready' ? (state.notes[0]?.author ?? null) : null;

  return (
    <div className="stack">
      <h2>Notes partagées</h2>

      {state.step === 'loading' && (
        <SkeletonGroup label="Ouverture du partage" lines={3} />
      )}

      {state.step === 'failed' && (
        <EmptyState
          title="Ce lien n’ouvre rien"
          description={state.message}
          action={<Link to="/">Aller à l’accueil</Link>}
        />
      )}

      {state.step === 'ready' && state.notes.length === 0 && (
        // Un jeton valide dont la note est redevenue privée : le lien vit
        // encore, la vanne est fermée. Le dire vaut mieux qu'une page vide.
        <EmptyState
          title="Rien à lire ici"
          description="Ce lien est encore valide, mais son auteur n’y a laissé aucune note ouverte à la lecture."
          action={<Link to="/">Aller à l’accueil</Link>}
        />
      )}

      {state.step === 'ready' && state.notes.length > 0 && (
        <>
          <p className="muted">
            {author
              ? `Partagé par ${author}.`
              : 'Partagé par quelqu’un qui n’a pas choisi de pseudonyme.'}{' '}
            Ces notes sont des opinions personnelles, pas des données de la
            saison.
          </p>
          {state.notes.map(note => (
            <Card key={note.id}>
              <CardHeader
                title={labelOf(choices, note.target, note.targetId)}
                subtitle={`modifiée le ${formatDate(note.updatedAt)}`}
              />
              {note.rating !== null && (
                <p className="rating" aria-label={`${note.rating} sur 5`}>
                  <span aria-hidden>{stars(note.rating)}</span>
                </p>
              )}
              {note.title && <p className="note-title">{note.title}</p>}
              <p className="shared-body">{note.body}</p>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
