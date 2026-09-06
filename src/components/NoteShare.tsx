/**
 * Partager UNE note : son texte, ou un lien de lecture.
 *
 * DEUX GESTES QUI N'ENGAGENT PAS LA MÊME CHOSE, et l'écran ne les confond pas.
 *
 * ENVOYER LE TEXTE ne publie rien. La note part par la feuille de partage du
 * système ou par le presse-papiers, telle qu'elle est à cet instant ; rien ne
 * change sur le serveur, et il n'y a rien à révoquer ensuite.
 *
 * CRÉER UN LIEN ouvre la note à la lecture : toute personne qui obtient
 * l'adresse la lit, sans compte. C'est pour cela que le bouton le DIT avant, et
 * que « Révoquer » est à côté du lien plutôt que caché ailleurs — révoquer
 * referme la visibilité de la note en plus d'éteindre l'adresse.
 *
 * POURQUOI LE QR PORTE LE LIEN ET NON LE TEXTE. Une note, elle, tiendrait dans
 * un QR code — 2 953 octets, c'est beaucoup de mots. Mais un texte gravé dans
 * un motif ne se révoque pas et ne suit pas les corrections de son auteur ;
 * le lien fait les deux.
 */
import { useState } from 'react';
import { Link2Off, Send, Share2 } from 'lucide-react';
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
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const link =
    (links ?? []).find(l => l.scope === 'note' && l.noteId === note.id) ?? null;

  const sendText = async () => {
    const text = notesToText(
      [{ ...note, about, updatedAt: note.updatedAt }],
      heading
    );
    const result = await shareOrCopy({ title: `Ma note sur ${about}`, text });
    if (result === 'copied') toast.success('Note copiée.');
    if (result === 'failed') toast.error('La note n’a pas pu être partagée.');
  };

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

  return (
    <div className="note-share">
      {link ? (
        <ShareLinkPanel
          link={sharedUrl(currentAppUrl(), 'note', link.token)}
          title={`Ma note sur ${about}`}
          qrLabel={`QR code du lien vers ma note sur ${about}`}
          note={
            <p className="muted qr-note">
              Ce lien ouvre la note en lecture, sans compte. Le QR porte le lien
              et non le texte : un texte gravé dans un motif ne se révoque pas
              et ne suit pas vos corrections.
            </p>
          }
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => void sendText()}
            disabled={busy}
          >
            <Send size={16} aria-hidden />
            Envoyer le texte
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(
                () => revokeLink(link),
                'Lien révoqué, la note est redevenue privée.'
              )
            }
          >
            <Link2Off size={16} aria-hidden />
            Révoquer le lien
          </Button>
        </ShareLinkPanel>
      ) : (
        <>
          <div className="photo-share-actions">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void sendText()}
              disabled={busy}
            >
              <Send size={16} aria-hidden />
              Envoyer le texte
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(() => shareNote(note.id), 'Lien de lecture créé.')
              }
            >
              <Share2 size={16} aria-hidden />
              Créer un lien de lecture
            </Button>
          </div>
          <p className="muted qr-note">
            Envoyer le texte ne publie rien. Un lien de lecture, lui, rend cette
            note lisible par qui l’obtient — et se révoque à tout moment.
          </p>
        </>
      )}
    </div>
  );
}
