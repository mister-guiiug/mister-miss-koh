/**
 * REPRENDRE QUAND LE RÉSEAU REVIENT.
 *
 * LE DÉFAUT. L'application décidait UNE FOIS, au pire moment, et ne revenait
 * jamais dessus. `init()` sort d'emblée si le magasin est `ready` — même prêt
 * sur un repli — et rien n'écoutait le retour de la connexion. Un visiteur qui
 * ouvrait l'application au démarrage de son téléphone lisait
 * « Serveur injoignable : dernière version enregistrée. » et restait sur cette
 * version périmée pour toute la session, alors que le réseau était revenu dans
 * la seconde. Signalé le 20/09/2026, et « au premier chargement » est
 * exactement la bonne observation : c'est le seul moment où la question se pose
 * mal.
 *
 * DEUX CHEMINS Y MÈNENT, et il faut les couvrir tous les deux.
 * `supabaseReferential` retombe sur le cache si `navigator.onLine` est faux à
 * l'instant précis de la lecture — une PWA ouverte depuis l'écran d'accueil est
 * servie par le service worker AVANT que la radio soit prête —, et aussi si le
 * serveur n'a pas répondu en cinq secondes. Le premier cas se résout seul dès
 * que le navigateur annonce `online` ; le second, non : aucun événement ne
 * viendra, et sans ce rattrapage le visiteur reste sur son cache.
 *
 * CE QUI EST RATTRAPÉ, ET RIEN D'AUTRE : l'écran montre un repli, c'est-à-dire
 * la dernière version enregistrée (`origin === 'cache'`) ou l'impasse
 * « Référentiel illisible » d'un premier chargement sans rien derrière lui. Une
 * lecture venue du serveur ne se redemande pas, et la démonstration non plus —
 * elle veut dire que le serveur a répondu qu'il ne publie rien.
 *
 * EN SILENCE. Le visiteur n'a rien demandé : l'avis qui disparaît est le seul
 * message utile. Le bouton des Réglages, lui, parle — c'est `useRefreshReferential`.
 */
import { useEffect, useRef } from 'react';
import { useOnline } from '@mister-guiiug/dev-pwa-config/react/use-online';
import { useAppStore } from '../store/useAppStore';

/**
 * Laisser retomber le premier chargement avant de redemander. Au moment où le
 * repli est décidé, le réseau est justement le plus chargé — le service worker
 * enregistre ses trente-deux entrées —, et repartir aussitôt pour neuf appels
 * s'ajouterait à l'embouteillage qui a causé le repli.
 */
const REPIT_MS = 1_500;

export function useReferentialRetry(repitMs: number = REPIT_MS): void {
  const origin = useAppStore(s => s.origin);
  const error = useAppStore(s => s.error);
  const referential = useAppStore(s => s.referential);
  const reload = useAppStore(s => s.reload);
  const online = useOnline();

  /**
   * UN SEUL RATTRAPAGE PAR RETOUR DE RÉSEAU. Sans ce garde, un serveur qui
   * répond « cache » à chaque tentative se ferait redemander sans fin.
   */
  const dejaTente = useRef(false);

  const surUnRepli = origin === 'cache' || (error !== null && !referential);

  useEffect(() => {
    if (!online) {
      // La connexion est retombée : le prochain retour aura droit à son essai.
      dejaTente.current = false;
      return;
    }
    if (!surUnRepli || dejaTente.current) return;

    dejaTente.current = true;
    const minuteur = setTimeout(() => {
      void reload();
    }, repitMs);
    return () => clearTimeout(minuteur);
  }, [online, surUnRepli, reload, repitMs]);
}
