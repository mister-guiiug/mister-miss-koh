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

  // Une panne déjà annoncée l'est restée : sans cette mémoire, un serveur muet
  // ferait sonner le toast toutes les quinze secondes, indéfiniment.
  const enPanne = useRef(false);

  /** Une panne se dit — celle d'un geste, toujours. */
  const dire = useCallback(
    (cause: unknown) => {
      enPanne.current = true;
      toast.error(cause instanceof Error ? cause.message : String(cause));
    },
    [toast]
  );

  /** Celle du relevé, qui tourne tout seul, ne se répète pas. */
  const direUneFois = useCallback(
    (cause: unknown) => {
      if (!enPanne.current) dire(cause);
    },
    [dire]
  );

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
      // Un tour complet : la prochaine panne sera une nouvelle, et se dira.
      enPanne.current = false;
    } finally {
      pompeEnCours.current = false;
    }
  }, [referential, read, setFile]);

  // Premier relevé dès qu'un compte existe : l'écran doit montrer ce que le
  // serveur porte déjà, pas une ardoise vierge.
  useEffect(() => {
    if (account) pomper().catch(direUneFois);
  }, [account, pomper, direUneFois]);

  useEffect(() => {
    if (!account || file.length === 0) return;
    const t = setInterval(() => pomper().catch(direUneFois), RELEVE_MS);
    return () => clearInterval(t);
  }, [account, file.length, pomper, direUneFois]);

  if (!available || account === undefined) return null;

  if (account === null) {
    return (
      <p className="muted ephemeral-invite">
        <Flame size={16} aria-hidden />
        {'\u00A0'}
        <Link to="/compte">Connectez-vous</Link> pour confier les portraits un
        par un, cinq à la fois.
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
    // `finally` ANNONÇAIT LE SUCCÈS MÊME EN CAS D'ÉCHEC, et le rejet de la
    // pompe ne rencontrait aucun `catch` — un serveur muet donnait donc un
    // « 5 liens en cours » radieux et une promesse non gérée dans la console.
    pomper()
      .then(() => {
        toast.success(
          suite.length > PARALLELE_MAX
            ? `${PARALLELE_MAX} liens partent ; les ${suite.length - PARALLELE_MAX} autres attendent une place.`
            : `${suite.length} lien${suite.length > 1 ? 's' : ''} en cours.`
        );
      })
      .catch(dire)
      .finally(() => setBusy(false));
  };

  const eteindre = (partage: PhotoShare) => {
    setBusy(true);
    photoShareRepository
      .revoke(partage)
      .then(() => pomper())
      .catch(dire)
      .finally(() => setBusy(false));
  };

  /**
   * Tout rendre d'un coup.
   *
   * SANS ÇA, SE TROMPER COÛTE CINQ CLICS. « Lancer la tournée » part sur toute
   * la saison ; s'en dédire demandait d'éteindre les liens un par un, et la
   * file continuait de repousser un remplaçant à chaque place libérée.
   */
  const toutEteindre = () => {
    setBusy(true);
    // La file d'abord : éteindre sans elle relancerait la pompe, qui
    // remplirait aussitôt les places qu'on vient de libérer.
    setFile([]);
    Promise.all(actifs.map(a => photoShareRepository.revoke(a)))
      .then(() => {
        setActifs([]);
        toast.success('Tous les liens sont éteints ; rien ne reste en ligne.');
      })
      .catch(dire)
      .finally(() => setBusy(false));
  };

  const nomDe = (id: string | null) =>
    referential?.contestants.find(c => c.id === id)?.displayName ??
    'un portrait';

  // Ce qu'il resterait à enfiler MAINTENANT. Le bouton ne se montrait que
  // tournée vide et file vide : déposer un portrait de plus pendant que cinq
  // liens vivaient n'offrait donc aucun moyen de l'ajouter, sinon en
  // éteignant les autres.
  const aEnfiler = referential
    ? fileDesPortraits(
        referential,
        avecPortrait,
        actifs.map(a => a.contestantId ?? '')
      )
    : [];

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

      {file.length === 0 && aEnfiler.length > 0 && (
        <Button size="sm" disabled={busy || !referential} onClick={lancer}>
          <Flame size={16} aria-hidden />
          {actifs.length === 0
            ? 'Lancer la tournée'
            : `Enfiler les ${aEnfiler.length} portraits restants`}
        </Button>
      )}

      {/* OÙ EN EST-ON, en une ligne : ce qui est en ligne, ce qui attend, et
          le fait que ça avance sans qu'on y touche. La ligne d'avant ne
          comptait que l'attente — on ne savait donc pas combien de places
          étaient prises, alors que c'est le nombre qui décide de tout ici. */}
      {(actifs.length > 0 || file.length > 0) && (
        <p className="muted ephemeral-quota" role="status">
          {actifs.length} lien{actifs.length > 1 ? 's' : ''} en cours sur{' '}
          {PARALLELE_MAX}
          {file.length > 0
            ? ` · ${file.length} portrait${file.length > 1 ? 's' : ''} en attente d’une place. Le relevé se fait tout seul, toutes les quinze secondes.`
            : ' · plus personne n’attend : ce sont les derniers.'}
        </p>
      )}

      {actifs.map(partage => {
        const nom = nomDe(partage.contestantId);
        const reste = remainingLabel(partage.expiresAt);
        const vignette = urls[partage.contestantId ?? ''];
        return (
          <div key={partage.id} className="queue-row">
            {/* LA VIGNETTE DIT QUEL PORTRAIT ON EST EN TRAIN DE MONTRER. Un
                nom ne suffit pas quand on a déposé deux images de la même
                personne, ni quand on s'est trompé de fiche — et c'est
                justement avant de donner le lien qu'on veut le voir.
                Décorative : le nom est juste à côté, et il porte déjà. */}
            <p className="queue-name">
              {vignette && (
                <img className="queue-vignette" src={vignette} alt="" />
              )}
              {/* LE TEXTE EN UN SEUL ENFANT. La rangée est un `flex` : sans ce
                  span, le nom et la durée deviendraient deux colonnes et
                  l'espace entre eux disparaîtrait — c'est exactement ce qui
                  cassait l'invitation « Connectez-vous » juste au-dessus. */}
              <span>
                <strong>{nom}</strong>{' '}
                <span className="muted">
                  {reste ? `encore ${reste}` : 'expiré'}
                </span>
              </span>
            </p>
            <ShareLinkPanel
              lead
              compact
              link={photoShareUrl(currentAppUrl(), partage.token)}
              title={`Portrait de ${nom}`}
              qrTarget={`le portrait de ${nom}, une seule fois`}
              note={
                <p className="muted qr-note">
                  Ce QR code ouvre CE portrait, une seule fois. Une fois scanné,
                  la place revient au suivant de la file.
                </p>
              }
            >
              {/* `ghost` ET NON `outline` : détruire ne doit pas peser autant
                  que donner. Les deux se ressemblaient trait pour trait, et le
                  geste qu'on vient faire est le premier. */}
              <Button
                variant="ghost"
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

      {actifs.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={toutEteindre}
        >
          <Trash2 size={16} aria-hidden />
          {file.length > 0 ? 'Tout éteindre et vider la file' : 'Tout éteindre'}
        </Button>
      )}
    </section>
  );
}
