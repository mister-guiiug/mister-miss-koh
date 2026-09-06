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
 * le choix de la cible, le lien vers chaque cible — et le partage.
 *
 * TROIS FAÇONS DE DONNER SES NOTES, ET ELLES N'ENGAGENT PAS LA MÊME CHOSE.
 *
 * 1. ENVOYER un texte, ou l'ENREGISTRER en fichier : rien n'est publié, rien
 *    ne vit sur le serveur, il n'y a rien à révoquer. C'est la route de qui
 *    veut simplement montrer ses notes à quelqu'un.
 * 2. UN LIEN PAR NOTE (`NoteShare`) : cette note-là devient lisible par qui
 *    obtient l'adresse.
 * 3. UN LIEN DE COLLECTION : une adresse qui montre TOUTES les notes rendues
 *    partageables. Il nomme une règle, pas une liste figée — décocher une note
 *    la retire du lien à la requête suivante, sans rien révoquer. C'est ce qui
 *    permet de reprendre sa parole sans casser l'adresse qu'on a donnée.
 *
 * LA SÉLECTION NE PARTAGE RIEN PAR ELLE-MÊME. Cocher des notes prépare un
 * envoi ou un enregistrement ; c'est le bouton « Partager par un lien » qui
 * publie, derrière une confirmation qui dit combien de notes et ce que ça veut
 * dire.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Download,
  Link2Off,
  Pencil,
  Send,
  Share2,
  Star,
  Trash2,
} from 'lucide-react';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { Badge } from '@mister-guiiug/dev-pwa-config/react/badge';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { ConfirmDialog } from '@mister-guiiug/dev-pwa-config/react/confirm-dialog';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import { formatDate } from '@mister-guiiug/dev-pwa-config/format';
import { downloadText } from '@mister-guiiug/dev-pwa-config/download';
import {
  currentAppUrl,
  shareOrCopy,
} from '@mister-guiiug/dev-pwa-config/share';
import { useAppStore } from '../../store/useAppStore';
import { useNotes } from '../../hooks/useNotes';
import { useNotesStore } from '../../store/useNotesStore';
import { NoteEditor, type NoteValues } from '../../components/NoteEditor';
import { NoteShare } from '../../components/NoteShare';
import { ShareLinkPanel } from '../../components/ShareLinkPanel';
import { NOTE_GROUPS, findChoice, noteChoices } from '../../domain/noteTargets';
import {
  notesFileName,
  notesToMarkdown,
  notesToText,
  type ExportableNote,
} from '../../domain/notesExport';
import { sharedUrl } from '../../domain/sharing';
import type { Note } from '../../backend/notes';

export function NotesScreen() {
  const { account, available, notes, loading, error } = useNotes();
  const referential = useAppStore(s => s.referential);
  const links = useNotesStore(s => s.links);
  const create = useNotesStore(s => s.create);
  const update = useNotesStore(s => s.update);
  const remove = useNotesStore(s => s.remove);
  const loadLinks = useNotesStore(s => s.loadLinks);
  const setShareable = useNotesStore(s => s.setShareable);
  const shareCollection = useNotesStore(s => s.shareCollection);
  const revokeLink = useNotesStore(s => s.revokeLink);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState('');
  /** La note en cours de correction. */
  const [editing, setEditing] = useState<string | null>(null);
  /** La note dont le panneau de partage est déplié. */
  const [sharing, setSharing] = useState<string | null>(null);
  /** Les notes cochées — une préparation, jamais une publication. */
  const [picked, setPicked] = useState<readonly string[]>([]);
  /** La note dont la suppression attend confirmation. */
  const [toDelete, setToDelete] = useState<Note | null>(null);
  /** La publication d'une collection attend confirmation. */
  const [toPublish, setToPublish] = useState(false);
  /** Remonte l'éditeur — donc le vide — après chaque note enregistrée. */
  const [formKey, setFormKey] = useState(0);

  const choices = useMemo(() => noteChoices(referential), [referential]);
  const choiceOf = (note: Note) =>
    findChoice(choices, note.target, note.targetId);
  const heading = referential
    ? `Mes notes — ${referential.season.name}`
    : 'Mes notes';

  useEffect(() => {
    if (account && links === null) void loadLinks();
  }, [account, links, loadLinks]);

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

  const exportable = (note: Note): ExportableNote => ({
    title: note.title,
    body: note.body,
    rating: note.rating,
    updatedAt: note.updatedAt,
    about: choiceOf(note)?.label ?? 'Cible retirée du référentiel',
  });

  const chosen = (notes ?? []).filter(n => picked.includes(n.id));
  const shareable = (notes ?? []).filter(n => n.visibility !== 'private');
  const collection = (links ?? []).find(l => l.scope === 'note_collection');

  const toggle = (id: string) =>
    setPicked(current =>
      current.includes(id) ? current.filter(x => x !== id) : [...current, id]
    );

  const sendSelection = async () => {
    const text = notesToText(chosen.map(exportable), heading);
    const result = await shareOrCopy({ title: heading, text });
    if (result === 'copied') toast.success('Notes copiées.');
    if (result === 'failed') toast.error('L’envoi n’a pas abouti.');
  };

  const saveSelection = () => {
    const document = notesToMarkdown(chosen.map(exportable), heading);
    if (!downloadText(document, notesFileName(heading), 'text/markdown')) {
      toast.error('L’enregistrement n’a pas pu démarrer.');
    }
  };

  const publishSelection = () =>
    run(
      async () => {
        // La visibilité D'ABORD, le lien ensuite : un lien de collection créé
        // avant n'ouvrirait rien, et l'écran promettrait plus qu'il ne fait.
        for (const note of chosen) {
          if (note.visibility === 'private') await setShareable(note.id, true);
        }
        await shareCollection(heading);
      },
      'Lien de collection prêt.',
      () => {
        setToPublish(false);
        setPicked([]);
      }
    );

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
              {NOTE_GROUPS.map(group => (
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

      {collection && (
        <Card>
          <CardHeader
            title="Lien de vos notes partagées"
            subtitle={`${shareable.length} note${shareable.length > 1 ? 's' : ''} ouverte${shareable.length > 1 ? 's' : ''} à la lecture`}
          />
          <ShareLinkPanel
            link={sharedUrl(currentAppUrl(), 'notes', collection.token)}
            title={heading}
            qrLabel="QR code du lien vers vos notes partagées"
            note={
              <p className="muted qr-note">
                Ce lien montre les notes marquées « partagée », telles qu’elles
                sont à l’instant où on l’ouvre. Retirer une note du partage la
                fait disparaître aussitôt, sans révoquer le lien ni en refaire
                un.
              </p>
            }
          >
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(
                  () => revokeLink(collection),
                  'Lien de collection révoqué.',
                  () => undefined
                )
              }
            >
              <Link2Off size={16} aria-hidden />
              Révoquer
            </Button>
          </ShareLinkPanel>
        </Card>
      )}

      {picked.length > 0 && (
        <div className="bulk-bar" role="group" aria-label="Notes sélectionnées">
          <strong>
            {picked.length} note{picked.length > 1 ? 's' : ''} sélectionnée
            {picked.length > 1 ? 's' : ''}
          </strong>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void sendSelection()}
          >
            <Send size={16} aria-hidden />
            Envoyer
          </Button>
          <Button variant="outline" size="sm" onClick={saveSelection}>
            <Download size={16} aria-hidden />
            Enregistrer
          </Button>
          <Button size="sm" disabled={busy} onClick={() => setToPublish(true)}>
            <Share2 size={16} aria-hidden />
            Partager par un lien
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPicked([])}>
            Tout décocher
          </Button>
        </div>
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
            const about = target?.label ?? 'une cible retirée';
            return (
              <li key={note.id} className="note">
                <div className="note-row">
                  <input
                    type="checkbox"
                    className="note-pick"
                    checked={picked.includes(note.id)}
                    onChange={() => toggle(note.id)}
                    aria-label={`Sélectionner la note sur ${about}`}
                  />
                  <div>
                    <strong>
                      {target ? (
                        <Link to={target.href}>{target.label}</Link>
                      ) : (
                        'Cible retirée du référentiel'
                      )}
                    </strong>{' '}
                    {note.visibility !== 'private' && (
                      <Badge tone="warning" size="xs">
                        partagée
                      </Badge>
                    )}
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
                        {note.title && (
                          <p className="note-title">{note.title}</p>
                        )}
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
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        iconOnly
                        aria-label={`Partager la note sur ${about}`}
                        aria-expanded={sharing === note.id}
                        onClick={() =>
                          setSharing(sharing === note.id ? null : note.id)
                        }
                      >
                        <Share2 size={18} aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        iconOnly
                        aria-label={`Modifier la note sur ${about}`}
                        onClick={() => setEditing(note.id)}
                      >
                        <Pencil size={18} aria-hidden />
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    aria-label={`Supprimer la note sur ${about}`}
                    onClick={() => setToDelete(note)}
                  >
                    <Trash2 size={18} aria-hidden />
                  </Button>
                </div>
                {sharing === note.id && (
                  <NoteShare note={note} about={about} heading={heading} />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={toPublish}
        title={`Partager ${picked.length} note${picked.length > 1 ? 's' : ''} par un lien ?`}
        message={`Ces notes deviendront lisibles par toute personne qui obtient le lien, sans compte. Vous pourrez révoquer le lien, ou retirer une note du partage, à tout moment.`}
        loading={busy}
        onConfirm={() => void publishSelection()}
        onCancel={() => setToPublish(false)}
      />

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
                if (sharing === toDelete.id) setSharing(null);
                setToDelete(null);
              }
            );
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
