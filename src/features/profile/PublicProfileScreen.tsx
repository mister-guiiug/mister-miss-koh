/**
 * Le profil de quelqu'un, à son adresse — pour n'importe qui, sans compte.
 *
 * AUCUNE FONCTION DE SERVEUR ICI, et ce n'est pas un raccourci. La politique
 * `profils_lecture_publique` ouvre à `anon` toute ligne dont la visibilité est
 * « public », et `notes_lecture_publique` fait de même pour les notes
 * « public ». Deux lectures ordinaires suffisent, et c'est le SERVEUR qui
 * décide : un profil privé ne rend aucune ligne, quelle que soit l'adresse
 * qu'on tape.
 *
 * INTROUVABLE ET PRIVÉ SE DISENT PAREIL. Un identifiant qui n'existe pas et un
 * profil qui s'est refermé rendent tous deux zéro ligne, et l'écran n'essaie
 * pas de les distinguer : le faire dirait à un curieux qu'une adresse a été
 * prise.
 *
 * LES NOTES AFFICHÉES SONT LES `public` DE SON AUTEUR, et elles seules. Une
 * note « par lien » ne remonte jamais ici — l'ouvrir à qui a l'adresse n'est
 * pas l'ouvrir au monde.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { formatDate } from '@mister-guiiug/dev-pwa-config/format';
import { useAppStore } from '../../store/useAppStore';
import {
  profileRepository,
  type PublicProfileView,
} from '../../backend/profile';
import { labelOf, noteChoices } from '../../domain/noteTargets';
import { stars } from '../../domain/notesExport';

type State =
  | { step: 'loading' }
  | { step: 'ready'; view: PublicProfileView }
  | { step: 'absent' };

export function PublicProfileScreen() {
  const { handle } = useParams();
  if (!handle) {
    return <Absent />;
  }
  return <PublicProfile handle={handle} />;
}

function Absent() {
  return (
    <div className="stack">
      <h2>Profil</h2>
      <EmptyState
        title="Aucun profil à cette adresse"
        description="Cette adresse n’existe pas, ou son profil n’est pas public."
        action={<Link to="/">Aller à l’accueil</Link>}
      />
    </div>
  );
}

function PublicProfile({ handle }: { handle: string }) {
  const referential = useAppStore(s => s.referential);
  const [state, setState] = useState<State>({ step: 'loading' });

  useEffect(() => {
    let alive = true;
    profileRepository
      .loadPublic(handle)
      .then(view => {
        if (!alive) return;
        setState(view ? { step: 'ready', view } : { step: 'absent' });
      })
      // Une panne de lecture se dit comme une absence : l'écran n'a rien de
      // plus utile à proposer, et le détail technique n'aiderait personne.
      .catch(() => {
        if (alive) setState({ step: 'absent' });
      });
    return () => {
      alive = false;
    };
  }, [handle]);

  if (state.step === 'loading') {
    return (
      <div className="stack">
        <h2>Profil</h2>
        <SkeletonGroup label="Ouverture du profil" lines={3} />
      </div>
    );
  }

  if (state.step === 'absent') return <Absent />;

  const { profile, notes } = state.view;
  const choices = noteChoices(referential);

  return (
    <div className="stack">
      <h2>Profil</h2>
      <Card>
        <CardHeader title={profile.pseudonym} subtitle={`@${profile.handle}`} />
        {profile.bio && <p className="shared-body">{profile.bio}</p>}
        <p className="muted">
          Ce profil et ces notes sont ceux d’une personne qui suit la saison —
          des opinions personnelles, pas des données de la saison.
        </p>
      </Card>

      {profile.showNotes &&
        (notes.length === 0 ? (
          <EmptyState
            title="Aucune note publique"
            description="Cette personne montre ses notes publiques, mais n’en a encore rendu aucune publique."
          />
        ) : (
          notes.map(note => (
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
          ))
        ))}
    </div>
  );
}
