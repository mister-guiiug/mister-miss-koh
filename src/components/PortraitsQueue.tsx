/**
 * Confier TOUS les portraits pour un jour, cinq à la fois.
 *
 * MÊME PRINCIPE QUE SUR UNE FICHE — un lien qui meurt à la première ouverture
 * ou au bout d'un jour, la première des deux échéances — mais pour toute la
 * saison, et par vagues de cinq.
 *
 * POURQUOI CINQ, ET PAS TOUS. Le serveur ne porte que cinq liens vivants par
 * compte, et le sixième n'est pas refusé : il CHASSE LE PLUS ANCIEN (migration
 * 0022). Créer dix-huit liens d'un coup en tuerait treize sans rien dire, et
 * ceux qu'on aurait déjà donnés seraient morts. La file ne remplit donc que
 * les places libres.
 *
 * CE QUI FAIT AVANCER LA FILE. Un partage disparaît de la table dès qu'il est
 * ouvert : il n'est pas marqué, il est supprimé. Une place se libère donc
 * quand quelqu'un a ouvert la photo — ou quand un jour a passé. Il suffit de
 * recompter, ce que fait le relevé périodique ci-dessous. Rien à surveiller,
 * aucune notification à attendre du serveur.
 *
 * LE RELEVÉ NE TOURNE QUE S'IL SERT : pas de file, pas de minuterie.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flame, Trash2 } from 'lucide-react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import { currentAppUrl } from '@mister-guiiug/dev-pwa-config/share';
import { useSession } from '../hooks/useSession';
import { useAppStore } from '../store/useAppStore';
import { usePhotosStore } from '../store/usePhotosStore';
import { photoShareRepository, type PhotoShare } from '../backend/photoShare';
import {
  PARALLELE_MAX,
  fileDesPortraits,
  fileNettoyee,
  prochainsAConfier,
} from '../domain/portraitQueue';
import { isAlive, remainingLabel } from '../domain/photoShareLife';
import { photoFileName, photoShareUrl } from '../domain/sharing';
import { ShareLinkPanel } from './ShareLinkPanel';

/** Un quart de minute : assez pour suivre, assez peu pour ne pas marteler. */
const RELEVE_MS = 15_000;

export function PortraitsQueue() {
  const { account, available } = useSession();
  const referential = useAppStore(s => s.referential);
  const file = useAppStore(s => s.portraitQueue);
  const setFile = useAppStore(s => s.setPortraitQueue);
  const urls = usePhotosStore(s => s.urls);
  const read = usePhotosStore(s => s.read);
  const toast = useToast();

  const [actifs, setActifs] = useState<PhotoShare[]>([]);
  const [busy, setBusy] = useState(false);
  // Une pompe qui se relancerait pendant qu'elle tourne créerait deux liens
  // pour la même place : la garde vaut mieux qu'un état, qui arriverait trop
  // tard d'un rendu.
  const pompeEnCours = useRef(false);

  const avecPortrait = Object.keys(urls);

  /**
   * Remplit les places libres, puis relit. Le serveur est l'arbitre du nombre
   * de places : on ne se fie jamais à notre propre compte.
   */
  const pomper = useCallback(async () => {
    if (pompeEnCours.current || !referential) return;
    pompeEnCours.current = true;
    try {
      // TOUT SE RELIT DANS LES MAGASINS, rien n'est capturé par la fermeture.
      // La raison est un vrai défaut, attrapé par les tests : `Object.keys()`
      // rend un tableau NEUF à chaque rendu, donc une dépendance qui change
      // sans cesse, donc un `useCallback` d'identité neuve, donc un effet qui
      // se rejoue en boucle — et la pompe vidait la file entière au lieu de
      // n'en tirer que cinq. Le garde `pompeEnCours` n'y pouvait rien : les
      // relances étaient successives, pas concurrentes.
      const photos = Object.keys(usePhotosStore.getState().urls);
      const vivants = (await photoShareRepository.list()).filter(s =>
        isAlive(s.expiresAt)
      );
      const enFile = fileNettoyee(
        useAppStore.getState().portraitQueue,
        [],
        photos
      );
      const aPartir = prochainsAConfier(enFile, vivants.length);

      const partis: string[] = [];
      for (const id of aPartir) {
        const candidat = referential.contestants.find(c => c.id === id);
        const blob = await read(id);
        // Un portrait retiré pendant l'attente ne bloque pas la suite : il
        // quitte la file, et la place va au suivant.
        if (!candidat || !blob) {
          partis.push(id);
          continue;
        }
        const nom = photoFileName(candidat.displayName, blob.type);
        const cree = await photoShareRepository.share(
          new File([blob], nom, { type: blob.type }),
          `Portrait de ${candidat.displayName}`,
          id
        );
        vivants.push(cree);
        partis.push(id);
      }

      setActifs(vivants);
      if (partis.length > 0) {
        setFile(fileNettoyee(enFile, partis, photos));
      }
    } finally {
      pompeEnCours.current = false;
    }
  }, [referential, read, setFile]);

  // Premier relevé dès qu'un compte existe : l'écran doit montrer ce que le
  // serveur porte déjà, pas une ardoise vierge.
  useEffect(() => {
    if (account) void pomper();
  }, [account, pomper]);

  useEffect(() => {
    if (!account || file.length === 0) return;
    const t = setInterval(() => void pomper(), RELEVE_MS);
    return () => clearInterval(t);
  }, [account, file.length, pomper]);

  if (!available || account === undefined) return null;

  if (account === null) {
    return (
      <p className="muted ephemeral-invite">
        <Flame size={16} aria-hidden /> <Link to="/compte">Connectez-vous</Link>{' '}
        pour confier les portraits un par un, cinq à la fois.
      </p>
    );
  }

  const lancer = () => {
    if (!referential) return;
    setBusy(true);
    const suite = fileDesPortraits(
      referential,
      avecPortrait,
      actifs.map(a => a.contestantId ?? '')
    );
    setFile(suite);
    void pomper().finally(() => {
      setBusy(false);
      toast.success(
        suite.length > PARALLELE_MAX
          ? `${PARALLELE_MAX} liens partent ; les ${suite.length - PARALLELE_MAX} autres attendent une place.`
          : `${suite.length} lien${suite.length > 1 ? 's' : ''} en cours.`
      );
    });
  };

  const eteindre = (partage: PhotoShare) => {
    setBusy(true);
    photoShareRepository
      .revoke(partage)
      .then(() => pomper())
      .catch((cause: unknown) => {
        toast.error(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => setBusy(false));
  };

  const nomDe = (id: string | null) =>
    referential?.contestants.find(c => c.id === id)?.displayName ??
    'un portrait';

  return (
    <section className="ephemeral-share">
      <h4 className="ephemeral-title">
        <Flame size={16} aria-hidden /> Confier les portraits, cinq à la fois
      </h4>

      <p className="muted">
        Chaque lien porte UN portrait, s’éteint à la première ouverture — ou au
        bout d’un jour — et libère alors sa place au suivant. Le serveur n’en
        garde que {PARALLELE_MAX} vivants à la fois : les autres attendent leur
        tour ici, même si vous fermez l’application.
      </p>

      {actifs.length === 0 && file.length === 0 && (
        <Button
          size="sm"
          disabled={busy || avecPortrait.length === 0 || !referential}
          onClick={lancer}
        >
          <Flame size={16} aria-hidden />
          Lancer la tournée
        </Button>
      )}

      {file.length > 0 && (
        <p className="muted ephemeral-quota" role="status">
          {file.length} portrait{file.length > 1 ? 's' : ''} en attente d’une
          place. Le relevé se fait tout seul, toutes les quinze secondes.
        </p>
      )}

      {actifs.map(partage => {
        const nom = nomDe(partage.contestantId);
        const reste = remainingLabel(partage.expiresAt);
        return (
          <div key={partage.id} className="queue-row">
            <p className="queue-name">
              <strong>{nom}</strong>{' '}
              <span className="muted">
                {reste ? `encore ${reste}` : 'expiré'}
              </span>
            </p>
            <ShareLinkPanel
              link={photoShareUrl(currentAppUrl(), partage.token)}
              title={`Portrait de ${nom}`}
              qrLabel={`QR code du lien éphémère vers le portrait de ${nom}`}
              note={
                <p className="muted qr-note">
                  Ce QR code ouvre CE portrait, une seule fois. Une fois scanné,
                  la place revient au suivant de la file.
                </p>
              }
            >
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => eteindre(partage)}
                aria-label={`Éteindre le lien du portrait de ${nom}`}
              >
                <Trash2 size={16} aria-hidden />
                Éteindre
              </Button>
            </ShareLinkPanel>
          </div>
        );
      })}

      {actifs.length > 0 && file.length === 0 && (
        <p className="muted ephemeral-quota">
          Plus personne n’attend : ce sont les derniers.
        </p>
      )}
    </section>
  );
}
