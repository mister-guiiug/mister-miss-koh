/**
 * Les notes personnelles, toutes ensemble.
 *
 * ELLES VIVENT SUR LE SERVEUR, ET NULLE PART AILLEURS. Les favoris et les
 * épisodes vus restent sur l'appareil parce qu'ils n'ont aucune valeur hors
 * de lui ; une note a un texte, on la relit d'un autre appareil, et on ne veut
 * pas la perdre en vidant un cache. Elle demande donc un compte.
 *
 * DEPUIS LE MAGASIN PARTAGÉ (`useNotesStore`) : une note écrite sur la fiche
 * d'un candidat ou sous un épisode apparaît ici aussitôt, et l'inverse.
 * L'éditeur est le même partout (`NoteEditor`) ; cet écran ajoute seulement
 * le choix de la cible, groupé par nature, et le lien vers chaque cible.
 *
 * CE QUE CET ÉCRAN NE FAIT PAS, ET LE DIT : il ne partage rien. Le schéma
 * porte déjà `share_links`, sa fonction de jeton et ses politiques ; le
 * parcours de partage viendra à part, parce qu'un lien révocable mérite son
 * propre écran et ses propres tests.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Star, Trash2 } from 'lucide-react';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { ConfirmDialog } from '@mister-guiiug/dev-pwa-config/react/confirm-dialog';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import { formatDate } from '@mister-guiiug/dev-pwa-config/format';
import { useAppStore } from '../../store/useAppStore';
import { useNotes } from '../../hooks/useNotes';
import { useNotesStore } from '../../store/useNotesStore';
import { NoteEditor, type NoteValues } from '../../components/NoteEditor';
import type { Note, NoteTarget } from '../../backend/notes';

const GROUPS = ['Saison', 'Candidats', 'Épisodes'] as const;
type Group = (typeof GROUPS)[number];

/** Les cibles que cet écran sait proposer, avec de quoi les nommer et y aller. */
interface Choice {
  target: NoteTarget;
  id: string;
  label: string;
  group: Group;
  href: string;
}

export function NotesScreen() {
  const { account, available, notes, loading, error } = useNotes();
  const referential = useAppStore(s => s.referential);
  const create = useNotesStore(s => s.create);
  const update = useNotesStore(s => s.update);
  const remove = useNotesStore(s => s.remove);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState('');
  /** La note en cours de correction. */
  const [editing, setEditing] = useState<string | null>(null);
  /** La note dont la suppression attend confirmation. */
  const [toDelete, setToDelete] = useState<Note | null>(null);
  /** Remonte l'éditeur — donc le vide — après chaque note enregistrée. */
  const [formKey, setFormKey] = useState(0);

  const choices = useMemo<Choice[]>(() => {
    if (!referential) return [];
    return [
      {
        target: 'season' as const,
        id: referential.season.id,
        label: referential.season.name,
        group: 'Saison' as const,
        href: '/',
      },
      ...referential.contestants.map(c => ({
        target: 'season_contestant' as const,
        id: c.id,
        label: c.displayName,
        group: 'Candidats' as const,
        href: `/candidats/${c.id}`,
      })),
      ...referential.episodes.map(e => ({
        target: 'episode' as const,
        id: e.id,
        label: `Épisode ${e.number}`,
        group: 'Épisodes' as const,
        href: '/episodes',
      })),
    ];
  }, [referential]);

  const choiceOf = (note: Note) =>
    choices.find(c => c.target === note.target && c.id === note.targetId) ??
    null;

  if (!available || account === null) {
    return (
      <div className="stack">
        <h2>Notes</h2>
        <EmptyState
          title="Vos notes demandent un compte"
          description="Elles vivent sur le serveur, pour que vous les retrouviez d’un autre appareil et qu’un cache vidé ne les emporte pas. Vos favoris et vos épisodes vus, eux, restent sur cet appareil."
          action={<Link to="/compte">Se connecter</Link>}
        />
      </div>
    );
  }

  if (account === undefined) {
    return (
      <div className="stack">
        <h2>Notes</h2>
        <p role="status" className="muted">
          Vérification de la session…
        </p>
      </div>
    );
  }

  const run = async (
    action: () => Promise<unknown>,
    done: string,
    after: () => void
  ) => {
    setBusy(true);
    try {
      await action();
      after();
      toast.success(done);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const submitNew = (values: NoteValues) => {
    const target = choices.find(c => `${c.target}:${c.id}` === choice);
    if (!target) return;
    return run(
      () => create({ target: target.target, targetId: target.id, ...values }),
      'Note enregistrée.',
      () => setFormKey(k => k + 1)
    );
  };

  return (
    <div className="stack">
      <h2>Notes</h2>
      <p className="muted">
        Une note se prend aussi sur la fiche d’un candidat ou sous un épisode,
        là où la chose est sous vos yeux.
      </p>

      <Card>
        <CardHeader title="Écrire une note" />
        <NoteEditor
          key={formKey}
          onSubmit={submitNew}
          busy={busy}
          canSubmit={choice !== ''}
        >
          <label className="field">
            <span>À propos de</span>
            <select value={choice} onChange={e => setChoice(e.target.value)}>
              <option value="">Choisir…</option>
              {GROUPS.map(group => (
                <optgroup key={group} label={group}>
                  {choices
                    .filter(c => c.group === group)
                    .map(c => (
                      <option
                        key={`${c.target}:${c.id}`}
                        value={`${c.target}:${c.id}`}
                      >
                        {c.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        </NoteEditor>
      </Card>

      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}

      {notes === null ? (
        loading || !error ? (
          <SkeletonGroup label="Chargement des notes" lines={3} />
        ) : null
      ) : notes.length === 0 ? (
        <EmptyState
          title="Aucune note"
          description="La première s’écrit juste au-dessus."
        />
      ) : (
        <ul className="list">
          {notes.map(note => {
            const target = choiceOf(note);
            return (
              <li key={note.id} className="note">
                <div>
                  <strong>
                    {target ? (
                      <Link to={target.href}>{target.label}</Link>
                    ) : (
                      'Cible retirée du référentiel'
                    )}
                  </strong>
                  {editing === note.id ? (
                    <NoteEditor
                      initial={note}
                      onSubmit={values =>
                        run(
                          () => update(note.id, values),
                          'Note corrigée.',
                          () => setEditing(null)
                        )
                      }
                      onCancel={() => setEditing(null)}
                      busy={busy}
                      focusOnMount
                    />
                  ) : (
                    <>
                      {note.title && <p className="note-title">{note.title}</p>}
                      {note.rating !== null && (
                        <span
                          className="rating"
                          aria-label={`${note.rating} sur 5`}
                        >
                          {[1, 2, 3, 4, 5].map(n => (
                            <Star
                              key={n}
                              size={14}
                              aria-hidden
                              fill={
                                n <= (note.rating ?? 0)
                                  ? 'currentColor'
                                  : 'none'
                              }
                            />
                          ))}
                        </span>
                      )}
                      <p>{note.body}</p>
                      <small className="muted">
                        modifiée le {formatDate(note.updatedAt)}
                      </small>
                    </>
                  )}
                </div>
                {editing !== note.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    aria-label={`Modifier la note sur ${target?.label ?? 'une cible retirée'}`}
                    onClick={() => setEditing(note.id)}
                  >
                    <Pencil size={18} aria-hidden />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={`Supprimer la note sur ${target?.label ?? 'une cible retirée'}`}
                  onClick={() => setToDelete(note)}
                >
                  <Trash2 size={18} aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer cette note ?"
        message={
          toDelete
            ? `La note sur « ${choiceOf(toDelete)?.label ?? 'une cible retirée'} » sera retirée de votre compte.`
            : undefined
        }
        destructive
        loading={busy}
        onConfirm={() => {
          if (toDelete)
            void run(
              () => remove(toDelete.id),
              'Note supprimée.',
              () => {
                if (editing === toDelete.id) setEditing(null);
                setToDelete(null);
              }
            );
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
