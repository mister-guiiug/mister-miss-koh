/**
 * Les notes personnelles.
 *
 * ELLES VIVENT SUR LE SERVEUR, ET NULLE PART AILLEURS. Les favoris et les
 * épisodes vus restent sur l'appareil parce qu'ils n'ont aucune valeur hors
 * de lui ; une note a un texte, on la relit d'un autre appareil, et on ne veut
 * pas la perdre en vidant un cache. Elle demande donc un compte.
 *
 * CE QUE CET ÉCRAN NE FAIT PAS, ET LE DIT : il ne partage rien. Le schéma
 * porte déjà `share_links`, sa fonction de jeton et ses politiques ; le
 * parcours de partage viendra à part, parce qu'un lien révocable mérite son
 * propre écran et ses propres tests.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { ConfirmDialog } from '@mister-guiiug/dev-pwa-config/react/confirm-dialog';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import { formatDate } from '@mister-guiiug/dev-pwa-config/format';
import { useAppStore } from '../../store/useAppStore';
import { useSession } from '../../hooks/useSession';
import {
  type Note,
  type NoteTarget,
  notesRepository,
} from '../../backend/notes';

/** Les cibles que cet écran sait proposer, avec de quoi les nommer. */
interface Choice {
  target: NoteTarget;
  id: string;
  label: string;
}

export function NotesScreen() {
  const { account, available } = useSession();
  const referential = useAppStore(s => s.referential);
  const toast = useToast();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState('');
  const [body, setBody] = useState('');
  /** La note en cours de correction, et son texte de travail. */
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(
    null
  );
  /**
   * La note dont la suppression attend confirmation. La corbeille effaçait
   * au premier tap ; une suppression, même logique côté serveur, se demande.
   */
  const [toDelete, setToDelete] = useState<Note | null>(null);
  /** Incrémentée après chaque écriture : c'est ce qui redemande la liste. */
  const [revision, setRevision] = useState(0);
  const reload = () => setRevision(r => r + 1);

  /**
   * Le bouton « Modifier » disparaît en s'activant : sans ce déplacement, le
   * focus retomberait sur le document et un utilisateur au clavier perdrait sa
   * place. La référence est STABLE, sinon React la rejouerait à chaque frappe.
   */
  const focusOnMount = useCallback((el: HTMLTextAreaElement | null) => {
    el?.focus();
  }, []);

  const choices = useMemo<Choice[]>(() => {
    if (!referential) return [];
    return [
      {
        target: 'season' as const,
        id: referential.season.id,
        label: `Saison — ${referential.season.name}`,
      },
      ...referential.contestants.map(c => ({
        target: 'season_contestant' as const,
        id: c.id,
        label: `Candidat — ${c.displayName}`,
      })),
      ...referential.episodes.map(e => ({
        target: 'episode' as const,
        id: e.id,
        label: `Épisode ${e.number}`,
      })),
    ];
  }, [referential]);

  /**
   * La liste se recharge quand le compte change, et quand on la fait changer.
   *
   * `alive` n'est pas une précaution de principe : sans lui, une réponse partie
   * avant une déconnexion reviendrait peupler l'écran d'une liste que le compte
   * suivant n'a pas le droit de voir.
   */
  useEffect(() => {
    if (!account) return;
    let alive = true;
    notesRepository
      .list()
      .then(rows => {
        if (!alive) return;
        setNotes(rows);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (alive)
          setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      alive = false;
    };
  }, [account, revision]);

  const labelOf = (note: Note) =>
    choices.find(c => c.target === note.target && c.id === note.targetId)
      ?.label ?? 'Cible retirée du référentiel';

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = choices.find(c => `${c.target}:${c.id}` === choice);
    if (!target || !body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await notesRepository.create({
        target: target.target,
        targetId: target.id,
        title: null,
        body: body.trim(),
        rating: null,
      });
      setBody('');
      reload();
      toast.success('Note enregistrée.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!editing || !editing.body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await notesRepository.update(editing.id, { body: editing.body.trim() });
      setEditing(null);
      reload();
      toast.success('Note corrigée.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await notesRepository.remove(id);
      if (editing?.id === id) setEditing(null);
      reload();
      toast.info('Note supprimée.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
      setToDelete(null);
    }
  };

  return (
    <div className="stack">
      <h2>Notes</h2>

      <Card>
        <CardHeader title="Écrire une note" />
        <form className="stack" onSubmit={e => void submit(e)}>
          <label className="field">
            <span>À propos de</span>
            <select value={choice} onChange={e => setChoice(e.target.value)}>
              <option value="">Choisir…</option>
              {choices.map(c => (
                <option
                  key={`${c.target}:${c.id}`}
                  value={`${c.target}:${c.id}`}
                >
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Note</span>
            <textarea
              rows={4}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Ce que vous voulez retenir…"
              maxLength={20000}
            />
          </label>
          <Button
            type="submit"
            loading={busy}
            disabled={!choice || !body.trim()}
          >
            Enregistrer
          </Button>
        </form>
      </Card>

      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}

      {notes === null ? (
        <SkeletonGroup label="Chargement des notes" lines={3} />
      ) : notes.length === 0 ? (
        <EmptyState
          title="Aucune note"
          description="La première s’écrit juste au-dessus."
        />
      ) : (
        <ul className="list">
          {notes.map(note => (
            <li key={note.id} className="note">
              <div>
                <strong>{labelOf(note)}</strong>
                {editing?.id === note.id ? (
                  <div className="stack">
                    <label className="field">
                      <span className="sr-only">Corriger la note</span>
                      <textarea
                        rows={4}
                        ref={focusOnMount}
                        value={editing.body}
                        onChange={e =>
                          setEditing({ id: note.id, body: e.target.value })
                        }
                        maxLength={20000}
                      />
                    </label>
                    <div className="filters">
                      <Button
                        size="sm"
                        loading={busy}
                        disabled={!editing.body.trim()}
                        onClick={() => void save()}
                      >
                        Enregistrer
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(null)}
                      >
                        Annuler
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p>{note.body}</p>
                    <small className="muted">
                      modifiée le {formatDate(note.updatedAt)}
                    </small>
                  </>
                )}
              </div>
              {editing?.id !== note.id && (
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={`Modifier la note sur ${labelOf(note)}`}
                  onClick={() => setEditing({ id: note.id, body: note.body })}
                >
                  <Pencil size={18} aria-hidden />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label={`Supprimer la note sur ${labelOf(note)}`}
                onClick={() => setToDelete(note)}
              >
                <Trash2 size={18} aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer cette note ?"
        message={
          toDelete
            ? `La note sur « ${labelOf(toDelete)} » sera retirée de votre compte.`
            : undefined
        }
        destructive
        loading={busy}
        onConfirm={() => {
          if (toDelete) void remove(toDelete.id);
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
