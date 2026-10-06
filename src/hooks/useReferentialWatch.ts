/**
 * SUIVRE LES PUBLICATIONS PENDANT QU'ON REGARDE.
 *
 * LE DÉFAUT. L'application lisait le référentiel à l'ouverture, et quand on
 * tirait pour rafraîchir. Un soir de diffusion, l'import publie désormais une
 * élimination quelques minutes après qu'elle est écrite sur Wikipédia
 * (migration 0036), mais l'écran ouvert ne la voyait pas : il fallait penser
 * à rafraîchir.
 *
 * CE QUI EST FAIT. Tant que l'application est au premier plan et en ligne, elle
 * demande toutes les deux minutes, et à chaque retour au premier plan, le
 * numéro de la dernière publication de la saison regardée : une ligne, un
 * entier. S'il a avancé, elle relit le référentiel, en silence, et le dit par
 * un toast neutre. Jamais le CONTENU de la nouveauté : c'est la limite
 * anti-spoiler qui décide de ce qui se montre, pas une notification.
 *
 * L'APERÇU NON VALIDÉ AUSSI (migration 0039). Une décision d'un relecteur, ou
 * un nouveau lot retenu, change l'aperçu sans faire avancer aucune version :
 * le même tour demande donc aussi l'identité de l'aperçu servi. Si elle a
 * changé, la relecture le remplace, ou le retire, et propose le nouveau. Un
 * écran ouvert ne montre pas une proposition qu'un relecteur vient de
 * rejeter. Sans toast : rien n'a été publié.
 *
 * CE QUI N'EST PAS FAIT. En arrière-plan, rien : un onglet caché ne coûte
 * aucune requête, et le retour au premier plan rattrape d'un coup. Sur la
 * démonstration, rien non plus : elle n'a pas de serveur à suivre.
 */
import { useEffect, useRef } from 'react';
import { useOnline } from '@mister-guiiug/dev-pwa-config/react/use-online';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import { backend } from '../backend/referentialRepository';
import { invalidateReferential } from '../shared/queries/referential';
import { useAppStore } from '../store/useAppStore';

/** Le rythme de l'import de la soirée : rien ne sert de demander plus vite. */
export const SUIVI_MS = 120_000;

export const MESSAGE_NOUVEAUTE = 'De nouvelles données sont arrivées.';

export interface ReferentialWatchOptions {
  readonly intervalMs?: number;
  /** Injectable pour les tests ; le port du référentiel sinon. */
  readonly latestVersion?: (seasonId: string) => Promise<number | null>;
  /** Injectable pour les tests ; le port du référentiel sinon. */
  readonly previewIdentity?: (seasonSlug: string) => Promise<string | null>;
}

export function useReferentialWatch(
  options: ReferentialWatchOptions = {}
): void {
  const intervalMs = options.intervalMs ?? SUIVI_MS;
  const lire = options.latestVersion ?? backend.referential.latestVersion;
  const lireApercu =
    options.previewIdentity ?? backend.referential.previewRevision;
  const referential = useAppStore(s => s.referential);
  const origin = useAppStore(s => s.origin);
  const reload = useAppStore(s => s.reload);
  const online = useOnline();
  const toast = useToast();

  const seasonId = referential?.season.id;
  const version = referential?.provenance.version;
  // Le cache aussi : c'est une lecture du serveur, simplement plus ancienne.
  const suivable = origin === 'server' || origin === 'cache';

  // LE TOAST NE DÉPEND PAS DE L'EFFET QUI A RELU. La relecture change la
  // version, donc les dépendances de l'effet : React le nettoie AVANT que la
  // relecture ne rende la main, et un garde tenu par l'effet taisait le
  // toast à chaque fois. Seul le démontage du composant doit le taire.
  const monte = useRef(true);
  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);

  useEffect(() => {
    if (!lire || !suivable || !online) return;
    if (seasonId === undefined || version === undefined) return;

    let actif = true;
    let enCours = false;
    /** L'aperçu servi n'est plus celui que l'écran connaît. Une panne : non. */
    const apercuAChange = async (): Promise<boolean> => {
      if (!lireApercu) return false;
      const etat = useAppStore.getState();
      try {
        const identite = await lireApercu(etat.season);
        const connue = etat.apercu?.identifiant ?? etat.apercuDisponible;
        return identite !== connue;
      } catch {
        return false;
      }
    };
    const verifier = async () => {
      if (enCours || document.visibilityState !== 'visible') return;
      enCours = true;
      try {
        const derniere = await lire(seasonId);
        const avance = derniere !== null && derniere > version;
        const apercuChange = !avance && (await apercuAChange());
        if (!actif || (!avance && !apercuChange)) return;
        // Contrôle léger d'abord ; relecture complète seulement si plus récent.
        // Jamais via refetchOnWindowFocus — ce serait une lecture entière à
        // chaque focus d'onglet.
        await invalidateReferential(useAppStore.getState().season);
        await reload();
        // Ne l'annoncer que si la relecture l'a vraiment apportée : un échec
        // de relecture se dit ailleurs (avis des Réglages, rattrapage).
        const apres = useAppStore.getState().referential?.provenance.version;
        if (avance && monte.current && apres !== undefined && apres > version) {
          toast.info(MESSAGE_NOUVEAUTE);
        }
      } finally {
        enCours = false;
      }
    };

    const minuteur = setInterval(() => void verifier(), intervalMs);
    const auRetour = () => void verifier();
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      actif = false;
      clearInterval(minuteur);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, [
    lire,
    lireApercu,
    suivable,
    online,
    seasonId,
    version,
    reload,
    toast,
    intervalMs,
  ]);
}
