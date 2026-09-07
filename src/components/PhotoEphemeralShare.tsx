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
 * UN SEUL PARTAGE PAR PORTRAIT À L'ÉCRAN, MAIS LE COMPTE DES CINQ EST DIT.
 * Le serveur en tolère cinq par compte et le sixième n'est pas refusé : il
 * CHASSE LE PLUS ANCIEN. Cet écran ne montrait que le partage de CE portrait
 * et annonçait la règle au futur — « au-delà de cinq, le plus ancien
 * s'éteint » —, si bien qu'on pouvait tuer un lien donné la veille sans jamais
 * apprendre qu'on était au plafond. Le compte est déjà dans la réponse du
 * serveur : il est maintenant affiché, avant le clic.
 *
 * ET IL SE RELIT QUAND ON REVIENT. Un lien s'éteint à la première ouverture,
 * c'est-à-dire pendant qu'on est ailleurs — dans la messagerie où on vient de
 * le coller. L'écran ne relisait qu'au montage : il montrait donc encore comme
 * vivant un lien déjà consommé, et « Éteindre » sur ce lien-là échouait. Le
 * retour de l'onglet au premier plan est exactement le moment de reposer la
 * question.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
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
  /** Combien de liens le compte porte en tout — les cinq places. */
  const [enCours, setEnCours] = useState(0);
  /** Le lien de CE portrait a disparu entre deux relectures. */
  const [eteint, setEteint] = useState(false);
  const [busy, setBusy] = useState(false);
  // Le retour au premier plan fait souvent partir `visibilitychange` ET
  // `focus` : la garde évite d'interroger deux fois pour un seul geste.
  const enVol = useRef(false);
  // Le partage courant DOUBLÉ dans une référence : la relecture a besoin de
  // savoir s'il y en avait un avant, et l'apprendre depuis l'ancienne valeur
  // d'un `setState` obligerait à agir dans une fonction qui doit rester pure.
  const courant = useRef<EphemeralShare | null>(null);

  const poser = useCallback((next: EphemeralShare | null) => {
    courant.current = next;
    setShare(next);
  }, []);

  const refresh = useCallback(() => {
    if (enVol.current) return;
    enVol.current = true;
    photoShareRepository
      .list()
      .then(shares => {
        const vivants = shares.filter(s => isAlive(s.expiresAt));
        setEnCours(vivants.length);
        const mien = vivants.find(s => s.contestantId === contestantId) ?? null;
        // Il était là, il n'y est plus : quelqu'un l'a ouvert, ou le jour est
        // passé. Le serveur répond la même chose aux deux et ne peut pas faire
        // autrement — il n'en garde aucune trace.
        if (courant.current && !mien) setEteint(true);
        poser(mien);
      })
      // Un partage qu'on ne parvient pas à relire n'est pas une panne à
      // annoncer : le panneau propose simplement d'en créer un.
      .catch(() => poser(null))
      .finally(() => {
        enVol.current = false;
      });
  }, [contestantId, poser]);

  useEffect(() => {
    if (!account) return;
    refresh();
    const revenir = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', revenir);
    window.addEventListener('focus', revenir);
    return () => {
      document.removeEventListener('visibilitychange', revenir);
      window.removeEventListener('focus', revenir);
    };
  }, [account, refresh]);

  if (!available) return null;

  if (account === undefined) return null;

  if (account === null) {
    return (
      /* L'ESPACE APRÈS L'ICÔNE EST INSÉCABLE : une espace ordinaire est une
         occasion de couper, et une flamme seule en bout de ligne se lit comme
         une coquille. Ce qui la mettait seule sur SA ligne était autre chose —
         voir `.ephemeral-invite > svg` dans styles.css. */
      <p className="muted ephemeral-invite">
        <Flame size={16} aria-hidden />
        {'\u00A0'}
        <Link to="/compte">Connectez-vous</Link> pour confier ce portrait à
        quelqu’un pendant un jour.
      </p>
    );
  }

  const create = () => {
    if (!file) return;
    setBusy(true);
    setEteint(false);
    photoShareRepository
      .share(file, `Portrait de ${displayName}`, contestantId)
      .then(created => {
        poser(created);
        // Le nouveau prend une place — ou celle du plus ancien, que le
        // serveur vient de chasser. Dans les deux cas le compte ne bouge plus
        // au-delà du plafond.
        setEnCours(n => Math.min(n + 1, PHOTO_SHARE_ACTIVE_MAX));
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
        poser(null);
        setEnCours(n => Math.max(0, n - 1));
        // Éteindre soi-même n'est pas se faire ouvrir : l'avis « il a été
        // ouvert » n'aurait aucun sens ici, et le toast dit déjà ce qui vient
        // de se passer.
        setEteint(false);
        toast.success('Lien éteint : l’image a été effacée du serveur.');
      })
      .catch((cause: unknown) => {
        toast.error(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => setBusy(false));
  };

  const reste = share ? remainingLabel(share.expiresAt) : null;
  const plein = enCours >= PHOTO_SHARE_ACTIVE_MAX;

  return (
    <section className="ephemeral-share">
      <h4 className="ephemeral-title">
        <Flame size={16} aria-hidden /> Confier pour un jour
      </h4>

      {eteint && !share && (
        <p className="notice" role="status">
          Le lien de ce portrait n’existe plus : il a été ouvert, ou le jour est
          passé. L’image a quitté le serveur.
        </p>
      )}

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
          {/* LE COMPTE, PAS LA RÈGLE. « Au-delà de cinq, le plus ancien
              s'éteint » se lit comme une éventualité lointaine ; « les cinq
              places sont prises, celui-ci éteindra le plus ancien » se lit
              comme ce qui va se passer au prochain clic. */}
          <p
            className={
              plein
                ? 'ephemeral-quota ephemeral-quota-plein'
                : 'muted ephemeral-quota'
            }
            role="status"
          >
            {plein
              ? `Les ${PHOTO_SHARE_ACTIVE_MAX} places sont prises : ce lien-ci éteindra le plus ancien, même s’il a déjà été donné.`
              : `${enCours} lien${enCours > 1 ? 's' : ''} en cours sur ${PHOTO_SHARE_ACTIVE_MAX}. Au-delà, le plus ancien s’éteint pour laisser la place.`}
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
            lead
            link={photoShareUrl(currentAppUrl(), share.token)}
            title={`Portrait de ${displayName}`}
            qrTarget={`le portrait de ${displayName}, une seule fois`}
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
