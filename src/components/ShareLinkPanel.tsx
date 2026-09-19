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
import { GESTES, trackEvent } from '@mister-guiiug/dev-pwa-config/analytics';
import { qrToDataUrl } from '@mister-guiiug/dev-pwa-config/qr';

interface Props {
  /** L'adresse portée par le QR et par « Partager le lien ». */
  link: string;
  /** Le titre proposé à la feuille de partage du système. */
  title: string;
  /**
   * CE QUE CE LIEN OUVRE, en toutes lettres : « la fiche de Camille »,
   * « l'application », « le portrait de Camille, une seule fois ».
   *
   * LE PANNEAU EN COMPOSE LE NOM DU BOUTON, et pas seulement l'alternative de
   * l'image. Ce bouton s'appelait « QR code du lien » pour tout le monde : un
   * écran des Réglages en portait SIX du même nom — celui de l'application et
   * les cinq de la tournée —, une fiche en portait deux. Au lecteur d'écran,
   * six boutons identiques qui ouvrent six choses différentes ; à la souris,
   * deux QR dépliés côte à côte sans rien pour les distinguer.
   *
   * Le texte visible reste « QR code du lien » et le nom accessible le
   * PROLONGE — jamais ne le remplace : une commande vocale qui dit ce qu'on
   * lit à l'écran doit atteindre son bouton.
   */
  qrTarget: string;
  /** Ce que ce lien emporte — et ce qu'il n'emporte pas. */
  note?: ReactNode;
  /** Les boutons propres à l'appelant. */
  children?: ReactNode;
  /**
   * LE LIEN EST L'OBJET : « Partager le lien » ouvre la rangée, en bouton
   * principal, et les boutons de l'appelant suivent.
   *
   * Le défaut convient quand le lien est SECONDAIRE — sur une fiche, ce qu'on
   * veut donner c'est l'image, et le lien n'est qu'un repli qu'on découvre en
   * dépliant le QR. Il ne convient plus quand le lien EST ce qu'on est venu
   * donner : le lien d'un jour qu'on vient de créer n'avait AUCUN bouton pour
   * l'envoyer, il fallait déplier le QR pour trouver « Partager le lien » —
   * et le premier bouton de la rangée était « Éteindre », c'est-à-dire
   * l'inverse de ce qu'on venait faire.
   */
  lead?: boolean;
  /**
   * CE PANNEAU EST UNE RANGÉE PARMI SES PAREILLES, pas l'action d'une carte.
   *
   * Deux conséquences, et c'est la même raison qui les porte. Le QR se réduit à
   * son icône : répété cinq fois, « QR code du lien » faisait passer chaque
   * rangée sur deux lignes — trois boutons ne tiennent pas dans 317 px — et une
   * tournée de cinq portraits couvrait deux écrans. Et « Partager le lien »
   * cesse d'être un bouton plein : cinq boutons pleins l'un sous l'autre ne
   * hiérarchisent plus rien, et volent la vedette au seul geste qui engage
   * vraiment la carte — lancer la tournée.
   *
   * Le nom accessible, lui, ne se réduit jamais : c'est celui qui nomme la
   * cible, et c'est tout ce qui distingue cinq boutons les uns des autres.
   */
  compact?: boolean;
}

export function ShareLinkPanel({
  link,
  title,
  qrTarget,
  note,
  children,
  lead = false,
  compact = false,
}: Props) {
  const toast = useToast();
  const [qr, setQr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const sendLink = async () => {
    const result = await shareOrCopy({ title, url: link });
    /*
     * ICI, ET PAS CHEZ CHAQUE APPELANT. Ce panneau est le seul endroit par où
     * passe l'envoi d'un lien — fiche, note, collection, portrait du jour,
     * lien de l'application : cinq écrans, un geste.
     *
     * Le résultat porte le vocabulaire du socle (`shared` / `copied` /
     * `cancelled` / `failed`). Ni le lien, ni son jeton, ni le titre : ils
     * nomment une personne ou ouvrent un partage.
     */
    trackEvent(GESTES.PARTAGE, { resultat: result });
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

  // Le bouton et l'image du QR disent la MÊME chose, depuis la même source :
  // deux formulations séparées finiraient par diverger, et c'est justement
  // celle qui nomme la cible qui distingue six boutons les uns des autres.
  const nomDuQr = `QR code du lien vers ${qrTarget}`;

  // Un seul bouton, posé à un endroit ou à l'autre : le dupliquer donnerait
  // deux fois la même action à l'écran, et deux fois la même chose à lire.
  const boutonPartage = (
    <Button
      variant={lead && !compact ? 'primary' : 'outline'}
      size="sm"
      onClick={() => void sendLink()}
    >
      <Link2 size={16} aria-hidden />
      Partager le lien
    </Button>
  );

  return (
    <>
      <div className="photo-share-actions">
        {/* L'ORDRE EST CELUI DU GESTE : donner d'abord, montrer ensuite,
            défaire en dernier. */}
        {lead && boutonPartage}
        {children}
        {compact ? (
          <Button
            iconOnly
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={nomDuQr}
            onClick={toggleQr}
          >
            <QrCode size={16} aria-hidden />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={nomDuQr}
            onClick={toggleQr}
          >
            <QrCode size={16} aria-hidden />
            QR code du lien
          </Button>
        )}
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
            alt={nomDuQr}
          />
        ) : (
          <p className="muted">Création du QR code…</p>
        )}
        {note}
        <p className="share-link">{link}</p>
        {!lead && boutonPartage}
      </div>
    </>
  );
}
