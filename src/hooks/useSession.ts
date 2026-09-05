/**
 * Qui est connecté, et l'application le sait tout de suite.
 *
 * Le lien de connexion ramène l'utilisateur sur l'application avec un jeton
 * dans l'URL : `supabase-js` le consomme au démarrage, et l'abonnement
 * ci-dessous apprend le changement à l'interface. Sans lui, on reviendrait sur
 * un écran qui affiche encore « non connecté » alors que la session existe.
 */
import { useEffect, useState } from 'react';
import {
  type Account,
  authAvailable,
  currentAccount,
  watchSession,
} from '../backend/auth';

export interface SessionState {
  /** `null` = personne. `undefined` = on ne sait pas encore. */
  readonly account: Account | null | undefined;
  readonly available: boolean;
}

export function useSession(): SessionState {
  const [account, setAccount] = useState<Account | null | undefined>(
    authAvailable ? undefined : null
  );

  useEffect(() => {
    if (!authAvailable) return;
    let alive = true;
    let unsubscribe: (() => void) | undefined;

    void currentAccount().then(a => {
      if (alive) setAccount(a);
    });
    void watchSession(a => {
      if (alive) setAccount(a);
    }).then(off => {
      // La promesse peut aboutir APRÈS le démontage : on se désabonne alors
      // tout de suite, sinon l'abonnement survit au composant.
      if (alive) unsubscribe = off;
      else off();
    });

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);

  return { account, available: authAvailable };
}
