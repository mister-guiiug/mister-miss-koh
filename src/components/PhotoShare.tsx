/**
 * Partager le portrait qu'on a soi-même déposé.
 *
 * TROIS ROUTES, ET CHACUNE DIT CE QU'ELLE EMPORTE. « Envoyer l'image » ouvre la
 * feuille de partage du système : l'image passe d'appareil à appareil, sans
 * serveur, parce qu'elle n'est rangée que sur celui-ci. « Enregistrer l'image »
 * la dépose dans les fichiers — c'est la route de bureau, là où aucune feuille
 * de partage n'existe. Le QR code, lui, porte le LIEN de la fiche : un QR
 * contient au plus 2,9 ko, et l'écran affiche les deux tailles côte à côte
 * plutôt que de laisser croire qu'on scanne une photo.
 *
 * RIEN N'EST TÉLÉVERSÉ. Aucune des trois routes ne dépose l'image sur un
 * serveur : il n'y en a pas pour ça, et il n'y en aura pas. Le portrait est à
 * vous, il est sur votre appareil, et le partager veut dire le donner — pas le
 * publier.
 *
 * LE FICHIER EST PRÊT AVANT LE CLIC. Safari veut que `navigator.share` parte du
 * geste ; lire IndexedDB entre le clic et l'ouverture de la feuille suffirait à
 * le perdre. Le blob est donc relu au montage, et le bouton n'apparaît que
 * lorsqu'il est en main.
 */
import { useEffect, useId, useState } from 'react';
import { Download, Link2, QrCode, Share2 } from 'lucide-react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import { downloadBlob } from '@mister-guiiug/dev-pwa-config/download';
import {
  currentAppUrl,
  shareOrCopy,
} from '@mister-guiiug/dev-pwa-config/share';
import { qrToDataUrl } from '@mister-guiiug/dev-pwa-config/qr';
import { formatBytes } from '@mister-guiiug/dev-pwa-config/format';
import type { Contestant } from '../domain/referential';
import { usePhotosStore } from '../store/usePhotosStore';
import { canSharePhoto, sharePhoto } from '../backend/sharePhoto';
import { QR_MAX_BYTES, contestantUrl, photoFileName } from '../domain/sharing';

export function PhotoShare({ contestant }: { contestant: Contestant }) {
  const url = usePhotosStore(s => s.urls[contestant.id]);
  if (!url) return null;
  // `key` sur l'URL d'objet : remplacer la photo REMONTE le panneau, qui ne
  // peut donc jamais partager l'image d'avant le remplacement.
  return <SharePanel key={url} contestant={contestant} />;
}

function SharePanel({ contestant }: { contestant: Contestant }) {
  const read = usePhotosStore(s => s.read);
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const panelId = useId();

  const title = `Portrait de ${contestant.displayName}`;
  const link = contestantUrl(currentAppUrl(), contestant.id);

  useEffect(() => {
    let alive = true;
    read(contestant.id)
      .then(blob => {
        if (!alive || !blob) return;
        const name = photoFileName(contestant.displayName, blob.type);
        setFile(new File([blob], name, { type: blob.type }));
      })
      // Une base illisible laisse les boutons désactivés : c'est déjà ce
      // qu'ils disent, il n'y a rien de plus à annoncer.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [read, contestant.id, contestant.displayName]);

  const send = async () => {
    if (!file) return;
    setBusy(true);
    const result = await sharePhoto(file, title);
    setBusy(false);
    // « shared » : la feuille du système a déjà tout dit. « cancelled » : on ne
    // signale pas une panne à qui vient de renoncer.
    if (result === 'failed') toast.error('Le partage n’a pas abouti.');
    if (result === 'unsupported') {
      toast.error('Cet appareil ne sait pas envoyer une image.');
    }
  };

  const save = () => {
    if (!file) return;
    if (!downloadBlob(file, file.name)) {
      toast.error('L’enregistrement n’a pas pu démarrer.');
    }
  };

  const sendLink = async () => {
    const result = await shareOrCopy({ title, url: link });
    if (result === 'copied') toast.success('Lien copié.');
    if (result === 'failed') toast.error('Le lien n’a pas pu être partagé.');
  };

  const toggleQr = () => {
    const next = !open;
    setOpen(next);
    // Le poids du QR (~50 ko) n'est téléchargé qu'ici, à la première ouverture.
    if (next && !qr) {
      // `margin: 4` : la ZONE DE SILENCE que la norme exige autour du motif.
      // La rogner fait échouer des lecteurs, et le rembourrage CSS ne la
      // remplace pas — il n'est pas garanti clair sur tous les thèmes.
      qrToDataUrl(link, { width: 512, margin: 4, errorCorrectionLevel: 'M' })
        .then(setQr)
        .catch(() => toast.error('Le QR code n’a pas pu être créé.'));
    }
  };

  return (
    <section className="photo-share">
      <h3 className="photo-share-title">Partager ce portrait</h3>
      <div className="photo-share-actions">
        {file && canSharePhoto(file, title) && (
          <Button size="sm" disabled={busy} onClick={() => void send()}>
            <Share2 size={16} aria-hidden />
            Envoyer l’image
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={!file} onClick={save}>
          <Download size={16} aria-hidden />
          Enregistrer l’image
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggleQr}
        >
          <QrCode size={16} aria-hidden />
          QR code du lien
        </Button>
      </div>

      {/* Toujours dans le document, pour que `aria-controls` désigne quelque
          chose ; `[hidden]` est rétabli en CSS, qu'une règle `display` couvre. */}
      <div id={panelId} className="qr-block" hidden={!open}>
        {qr ? (
          <img
            className="qr-code"
            src={qr}
            width={192}
            height={192}
            alt={`QR code du lien vers la fiche de ${contestant.displayName}`}
          />
        ) : (
          <p className="muted">Création du QR code…</p>
        )}
        <p className="muted qr-note">
          Ce QR code ouvre la fiche de {contestant.displayName} sur un autre
          appareil. Il ne porte pas l’image
          {file
            ? ` : un QR code contient au plus ${formatBytes(QR_MAX_BYTES)}, ce portrait en pèse ${formatBytes(file.size)}`
            : ''}
          . L’image part par les boutons ci-dessus, d’appareil à appareil, sans
          passer par un serveur.
        </p>
        <p className="share-link">{link}</p>
        <Button variant="outline" size="sm" onClick={() => void sendLink()}>
          <Link2 size={16} aria-hidden />
          Partager le lien
        </Button>
      </div>
    </section>
  );
}
