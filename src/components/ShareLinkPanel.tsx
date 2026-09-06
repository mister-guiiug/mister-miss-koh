/**
 * Un lien à donner : le QR code, l'adresse en clair, et le partage natif.
 *
 * PROMU DEPUIS `PhotoShare`, PAS INVENTÉ ICI. Le portrait avait ce bloc pour
 * lui ; les notes en veulent le même, au caractère près. Le recopier serait
 * s'assurer qu'un jour l'un des deux perdra la zone de silence du QR ou le
 * `[hidden]` rétabli en CSS. L'appelant garde ce qui lui est propre — ses
 * boutons, et la phrase qui dit ce que le QR ne porte PAS.
 *
 * LE QR NE S'ENCODE QU'À L'OUVERTURE. `qrcode` pèse une cinquantaine de
 * kilo-octets et la plupart des visites ne déplieront jamais ce bloc : il est
 * chargé au premier clic, pas au montage.
 */
import { useId, useState, type ReactNode } from 'react';
import { Link2, QrCode } from 'lucide-react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import { shareOrCopy } from '@mister-guiiug/dev-pwa-config/share';
import { qrToDataUrl } from '@mister-guiiug/dev-pwa-config/qr';

interface Props {
  /** L'adresse portée par le QR et par « Partager le lien ». */
  link: string;
  /** Le titre proposé à la feuille de partage du système. */
  title: string;
  /** Ce que le QR ouvre, dit au lecteur d'écran. */
  qrLabel: string;
  /** Ce que ce lien emporte — et ce qu'il n'emporte pas. */
  note?: ReactNode;
  /** Les boutons propres à l'appelant, avant celui du QR. */
  children?: ReactNode;
}

export function ShareLinkPanel({
  link,
  title,
  qrLabel,
  note,
  children,
}: Props) {
  const toast = useToast();
  const [qr, setQr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const sendLink = async () => {
    const result = await shareOrCopy({ title, url: link });
    if (result === 'copied') toast.success('Lien copié.');
    if (result === 'failed') toast.error('Le lien n’a pas pu être partagé.');
  };

  const toggleQr = () => {
    const next = !open;
    setOpen(next);
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
    <>
      <div className="photo-share-actions">
        {children}
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
            alt={qrLabel}
          />
        ) : (
          <p className="muted">Création du QR code…</p>
        )}
        {note}
        <p className="share-link">{link}</p>
        <Button variant="outline" size="sm" onClick={() => void sendLink()}>
          <Link2 size={16} aria-hidden />
          Partager le lien
        </Button>
      </div>
    </>
  );
}
