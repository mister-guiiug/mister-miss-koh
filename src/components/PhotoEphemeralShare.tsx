/**
 * Confier un portrait pour un jour — la seule route de l'application qui
 * DÉPOSE une image sur un serveur.
 *
 * ELLE EST À PART, ET L'ÉCRAN LE MONTRE. Les trois autres routes du panneau
 * donnent l'image d'appareil à appareil, ou ne portent qu'un lien vers une
 * fiche. Celle-ci publie. Le bandeau le dit avant le clic, en nommant les deux
 * bornes — un jour, une ouverture —, parce qu'après le clic il est trop tard
 * pour l'apprendre.
 *
 * IL FAUT UN COMPTE. Non pour identifier qui que ce soit auprès du
 * destinataire — le lien ne porte aucun nom —, mais parce qu'un dépôt sans
 * propriétaire serait un hébergement anonyme : rien à plafonner, rien à
 * éteindre, personne à qui le rendre.
 *
 * UN SEUL PARTAGE PAR PORTRAIT À L'ÉCRAN. Le serveur en tolère cinq par compte
 * et fait glisser les plus anciens ; ici, on montre celui de CE portrait, avec
 * ce qu'il lui reste à vivre et de quoi l'éteindre tout de suite.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flame, Trash2 } from 'lucide-react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import { currentAppUrl } from '@mister-guiiug/dev-pwa-config/share';
import { useSession } from '../hooks/useSession';
import {
  photoShareRepository,
  PHOTO_SHARE_ACTIVE_MAX,
  type PhotoShare as EphemeralShare,
} from '../backend/photoShare';
import { isAlive, remainingLabel } from '../domain/photoShareLife';
import { photoShareUrl } from '../domain/sharing';
import { ShareLinkPanel } from './ShareLinkPanel';

interface Props {
  /** Le portrait déjà en main — le même fichier que les autres routes. */
  file: File | null;
  contestantId: string;
  displayName: string;
}

export function PhotoEphemeralShare({
  file,
  contestantId,
  displayName,
}: Props) {
  const { account, available } = useSession();
  const toast = useToast();
  const [share, setShare] = useState<EphemeralShare | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    photoShareRepository
      .list()
      .then(shares => {
        setShare(
          shares.find(
            s => s.contestantId === contestantId && isAlive(s.expiresAt)
          ) ?? null
        );
      })
      // Un partage qu'on ne parvient pas à relire n'est pas une panne à
      // annoncer : le panneau propose simplement d'en créer un.
      .catch(() => setShare(null));
  }, [contestantId]);

  useEffect(() => {
    if (account) refresh();
  }, [account, refresh]);

  if (!available) return null;

  if (account === undefined) return null;

  if (account === null) {
    return (
      <p className="muted ephemeral-invite">
        <Flame size={16} aria-hidden /> <Link to="/compte">Connectez-vous</Link>{' '}
        pour confier ce portrait à quelqu’un pendant un jour.
      </p>
    );
  }

  const create = () => {
    if (!file) return;
    setBusy(true);
    photoShareRepository
      .share(file, `Portrait de ${displayName}`, contestantId)
      .then(created => {
        setShare(created);
        toast.success('Lien créé — un jour, une ouverture.');
      })
      .catch((cause: unknown) => {
        toast.error(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => setBusy(false));
  };

  const revoke = () => {
    if (!share) return;
    setBusy(true);
    photoShareRepository
      .revoke(share)
      .then(() => {
        setShare(null);
        toast.success('Lien éteint : l’image a été effacée du serveur.');
      })
      .catch((cause: unknown) => {
        toast.error(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => setBusy(false));
  };

  const reste = share ? remainingLabel(share.expiresAt) : null;

  return (
    <section className="ephemeral-share">
      <h4 className="ephemeral-title">
        <Flame size={16} aria-hidden /> Confier pour un jour
      </h4>

      {!share && (
        <>
          <p className="muted">
            Une copie de ce portrait partira sur le serveur, où elle vivra{' '}
            <strong>un jour au plus</strong> et sera effacée{' '}
            <strong>dès la première ouverture</strong> — la première des deux
            qui arrive. C’est la seule chose que cette application publie.
          </p>
          <Button size="sm" disabled={!file || busy} onClick={create}>
            <Flame size={16} aria-hidden />
            Créer un lien d’un jour
          </Button>
          <p className="muted ephemeral-quota">
            Au-delà de {PHOTO_SHARE_ACTIVE_MAX} liens en cours, le plus ancien
            s’éteint pour laisser la place au nouveau.
          </p>
        </>
      )}

      {share && (
        <>
          <p className="muted">
            Ce lien s’éteint <strong>à la première ouverture</strong>
            {reste ? `, et de toute façon dans ${reste}` : ''}. Donnez-le à une
            seule personne.
          </p>
          <ShareLinkPanel
            link={photoShareUrl(currentAppUrl(), share.token)}
            title={`Portrait de ${displayName}`}
            qrLabel={`QR code du lien éphémère vers le portrait de ${displayName}`}
            note={
              <p className="muted qr-note">
                Ce QR code porte le LIEN, pas l’image — comme celui du dessus.
                La différence est ailleurs : celui-ci s’éteint après un seul
                usage.
              </p>
            }
          >
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={revoke}
            >
              <Trash2 size={16} aria-hidden />
              Éteindre maintenant
            </Button>
          </ShareLinkPanel>
        </>
      )}
    </section>
  );
}
