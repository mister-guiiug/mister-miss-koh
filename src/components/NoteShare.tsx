/**
 * Partager UNE note : dire qui peut la lire, puis l'envoyer.
 *
 * LA VISIBILITÉ EST LA VANNE, LE LIEN N'EST QU'UNE ADRESSE. Le serveur exige
 * `visibility in ('link','public')` pour ouvrir une note à un lecteur ; le
 * jeton, lui, dit seulement OÙ frapper. Les deux sont donc deux réglages
 * distincts à l'écran, et non un bouton unique qui ferait les deux en douce :
 * repasser une note en « Moi seul·e » la referme immédiatement, même si son
 * adresse existe encore — et l'adresse le dit.
 *
 * TROIS NIVEAUX, PAS DEUX. « Qui a le lien » se donne à quelqu'un ; « Tout le
 * monde » se publie, et la note remonte alors sur le profil public de son
 * auteur. Les confondre serait publier ce qu'on croyait confier.
 *
 * ENVOYER LE TEXTE ne publie rien : la note part par la feuille de partage du
 * système ou par le presse-papiers, telle qu'elle est à cet instant, et il n'y
 * a rien à révoquer ensuite.
 *
 * POURQUOI LE QR PORTE LE LIEN ET NON LE TEXTE. Une note tiendrait dans un QR
 * code — 2 953 octets, c'est beaucoup de mots. Mais un texte gravé dans un
 * motif ne se révoque pas et ne suit pas les corrections de son auteur ; le
 * lien fait les deux.
 */
import { useState } from 'react';
import { Link2, Link2Off, Send } from 'lucide-react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import {
  currentAppUrl,
  shareOrCopy,
} from '@mister-guiiug/dev-pwa-config/share';
import type { Note } from '../backend/notes';
import { useNotesStore } from '../store/useNotesStore';
import { notesToText } from '../domain/notesExport';
import { sharedUrl } from '../domain/sharing';
import { NOTE_VISIBILITIES } from '../domain/visibility';
import { ShareLinkPanel } from './ShareLinkPanel';

interface Props {
  note: Note;
  /** Ce sur quoi la note porte, déjà nommé par l'écran. */
  about: string;
  /** L'en-tête du texte envoyé — la saison suivie. */
  heading: string;
}

export function NoteShare({ note, about, heading }: Props) {
  const links = useNotesStore(s => s.links);
  const shareNote = useNotesStore(s => s.shareNote);
  const revokeLink = useNotesStore(s => s.revokeLink);
  const setVisibility = useNotesStore(s => s.setVisibility);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const link =
    (links ?? []).find(l => l.scope === 'note' && l.noteId === note.id) ?? null;

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(done);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const sendText = async () => {
    const text = notesToText(
      [{ ...note, about, updatedAt: note.updatedAt }],
      heading
    );
    const result = await shareOrCopy({ title: `Ma note sur ${about}`, text });
    if (result === 'copied') toast.success('Note copiée.');
    if (result === 'failed') toast.error('La note n’a pas pu être partagée.');
  };

  const envoyer = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void sendText()}
      disabled={busy}
    >
      <Send size={16} aria-hidden />
      Envoyer le texte
    </Button>
  );

  return (
    <div className="note-share">
      <fieldset className="field visibility-field">
        <legend>Qui peut lire cette note</legend>
        {NOTE_VISIBILITIES.map(option => (
          <div key={option.value} className="option">
            <label>
              <input
                type="radio"
                name={`visibilite-${note.id}`}
                value={option.value}
                checked={note.visibility === option.value}
                disabled={busy}
                onChange={() =>
                  void run(
                    () => setVisibility(note.id, option.value),
                    `Note : ${option.label.toLowerCase()}.`
                  )
                }
              />
              <strong>{option.label}</strong>
              <small className="muted">{option.hint}</small>
            </label>
          </div>
        ))}
      </fieldset>

      {link ? (
        <ShareLinkPanel
          link={sharedUrl(currentAppUrl(), 'note', link.token)}
          title={`Ma note sur ${about}`}
          qrLabel={`QR code du lien vers ma note sur ${about}`}
          note={
            <p className="muted qr-note">
              {note.visibility === 'private'
                ? 'Cette adresse existe encore mais n’ouvre rien : la note est revenue à « Moi seul·e ».'
                : 'Ce lien ouvre la note en lecture, sans compte.'}{' '}
              Le QR porte le lien et non le texte : un texte gravé dans un motif
              ne se révoque pas et ne suit pas vos corrections.
            </p>
          }
        >
          {envoyer}
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(() => revokeLink(link), 'Adresse révoquée.')
            }
          >
            <Link2Off size={16} aria-hidden />
            Révoquer l’adresse
          </Button>
        </ShareLinkPanel>
      ) : (
        <>
          <div className="photo-share-actions">
            {envoyer}
            {note.visibility !== 'private' && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(() => shareNote(note.id), 'Adresse créée.')
                }
              >
                <Link2 size={16} aria-hidden />
                Obtenir une adresse
              </Button>
            )}
          </div>
          {note.visibility === 'public' && (
            <p className="muted qr-note">
              Cette note est déjà lisible par tous et remonte sur votre profil
              public si vous y montrez vos notes. Une adresse propre sert à
              l’envoyer directement à quelqu’un.
            </p>
          )}
        </>
      )}
    </div>
  );
}
