/**
 * Les notes sur UNE chose — un candidat, un épisode — là où cette chose
 * s'affiche.
 *
 * L'écran Notes demandait de choisir la cible dans une liste de vingt-deux
 * entrées ; ici la cible est déjà sous les yeux. Sans compte, rien ne
 * s'affiche (ou, sur une fiche, une invitation) : les notes vivent sur le
 * serveur, et cet écran ne fait pas semblant du contraire.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { NotebookPen, Pencil, Star, Trash2 } from 'lucide-react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { ConfirmDialog } from '@mister-guiiug/dev-pwa-config/react/confirm-dialog';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import { formatDate } from '@mister-guiiug/dev-pwa-config/format';
import type { Note, NoteTarget } from '../backend/notes';
import { useNotes } from '../hooks/useNotes';
import { useNotesStore } from '../store/useNotesStore';
import { NoteEditor, type NoteValues } from './NoteEditor';

interface Props {
  target: NoteTarget;
  targetId: string;
  /** Ce que la note vise, pour le lecteur d'écran et les messages. */
  label: string;
  /** Sans compte : proposer de se connecter (fiche) plutôt que se taire (liste). */
  invite?: boolean;
}

function Rating({ value }: { value: number }) {
  return (
    <span className="rating" aria-label={`${value} sur 5`}>
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          size={14}
          aria-hidden
          fill={n <= value ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  );
}

export function TargetNotes({
  target,
  targetId,
  label,
  invite = false,
}: Props) {
  const { account, available, notes } = useNotes();
  const create = useNotesStore(s => s.create);
  const update = useNotesStore(s => s.update);
  const remove = useNotesStore(s => s.remove);
  const toast = useToast();
  const [writing, setWriting] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);

  const mine = useMemo(
    () =>
      (notes ?? []).filter(n => n.target === target && n.targetId === targetId),
    [notes, target, targetId]
  );

  if (!available) return null;
  if (account === null) {
    return invite ? (
      <p className="muted target-notes-invite">
        <NotebookPen size={16} aria-hidden />{' '}
        <Link to="/compte">Connectez-vous</Link> pour noter {label}.
      </p>
    ) : null;
  }
  if (account === undefined) return null;

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

  const submitNew = (values: NoteValues) =>
    run(
      () => create({ target, targetId, ...values }),
      'Note enregistrée.',
      () => setWriting(false)
    );

  const submitEdit = (id: string, values: NoteValues) =>
    run(
      () => update(id, values),
      'Note corrigée.',
      () => setEditing(null)
    );

  return (
    <section className="target-notes" aria-label={`Vos notes sur ${label}`}>
      {mine.length > 0 && (
        <ul className="list">
          {mine.map(note => (
            <li key={note.id} className="note">
              <div>
                {editing === note.id ? (
                  <NoteEditor
                    initial={note}
                    onSubmit={values => submitEdit(note.id, values)}
                    onCancel={() => setEditing(null)}
                    busy={busy}
                    focusOnMount
                  />
                ) : (
                  <>
                    {note.title && <strong>{note.title}</strong>}
                    {note.rating !== null && <Rating value={note.rating} />}
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
                  aria-label={`Modifier cette note sur ${label}`}
                  onClick={() => setEditing(note.id)}
                >
                  <Pencil size={18} aria-hidden />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label={`Supprimer cette note sur ${label}`}
                onClick={() => setToDelete(note)}
              >
                <Trash2 size={18} aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {writing ? (
        <NoteEditor
          onSubmit={submitNew}
          onCancel={() => setWriting(false)}
          busy={busy}
          focusOnMount
        />
      ) : (
        <Button variant="outline" size="sm" onClick={() => setWriting(true)}>
          <NotebookPen size={16} aria-hidden />
          {mine.length === 0 ? 'Ajouter une note' : 'Ajouter une autre note'}
        </Button>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer cette note ?"
        message={`La note sur ${label} sera retirée de votre compte.`}
        destructive
        loading={busy}
        onConfirm={() => {
          if (toDelete)
            void run(
              () => remove(toDelete.id),
              'Note supprimée.',
              () => setToDelete(null)
            );
        }}
        onCancel={() => setToDelete(null)}
      />
    </section>
  );
}
