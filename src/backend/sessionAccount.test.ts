import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  compteCourant,
  compteRange,
  navigateurHorsLigne,
} from './sessionAccount';

/**
 * CE QUE CES CAS TIENNENT : que personne ne remette un appel réseau bloquant
 * sur le chemin de « qui est connecté ». `auth.getUser()` commence par
 * `getSession()`, qui renouvelle le jeton périmé contre le réseau — une
 * demi-minute sans connexion, pendant laquelle l'application affichait
 * « personne » à quelqu'un dont la session dormait sur l'appareil.
 */
const UID = '11111111-2222-3333-4444-555555555555';
const CASE_SUPABASE = 'sb-oqldfzrsandcguajyxbh-auth-token';

function ranger(user: unknown) {
  localStorage.setItem(
    CASE_SUPABASE,
    JSON.stringify({
      access_token: 'entete.charge.signature',
      refresh_token: 'jeton-de-rafraichissement',
      // Périmé depuis deux heures : c'est le cas du lendemain matin.
      expires_at: Math.floor(Date.now() / 1000) - 7200,
      token_type: 'bearer',
      user,
    })
  );
}

let onLineOriginal: PropertyDescriptor | undefined;
function reseau(onLine: boolean) {
  onLineOriginal ??= Object.getOwnPropertyDescriptor(
    Navigator.prototype,
    'onLine'
  );
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => onLine,
  });
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  if (onLineOriginal)
    Object.defineProperty(navigator, 'onLine', onLineOriginal);
});

describe('le compte rangé sur l’appareil', () => {
  it('est lu dans la session, même périmée', () => {
    ranger({ id: UID, email: 'koh@exemple.fr' });
    expect(compteRange()).toEqual({ id: UID, email: 'koh@exemple.fr' });
  });

  it('accepte une session sans adresse', () => {
    ranger({ id: UID });
    expect(compteRange()).toEqual({ id: UID, email: null });
  });

  it('ignore les cases voisines de Supabase', () => {
    localStorage.setItem(`${CASE_SUPABASE}-code-verifier`, '"verifieur"');
    expect(compteRange()).toBeNull();
  });

  it('rend null sans identifiant, sur du JSON cassé, ou sans rien', () => {
    ranger({ email: 'koh@exemple.fr' });
    expect(compteRange()).toBeNull();
    localStorage.setItem(CASE_SUPABASE, 'ceci n’est pas du JSON');
    expect(compteRange()).toBeNull();
    localStorage.clear();
    expect(compteRange()).toBeNull();
  });
});

describe('« hors ligne »', () => {
  it('n’est affirmé que sur `onLine === false`', () => {
    // `!navigator.onLine` vaudrait VRAI là où la propriété n'existe pas : tout
    // environnement de test se croirait coupé du réseau.
    reseau(false);
    expect(navigateurHorsLigne()).toBe(true);
    reseau(true);
    expect(navigateurHorsLigne()).toBe(false);
  });
});

describe('le compte courant', () => {
  const duServeur = { id: 'serveur', email: 'serveur@exemple.fr' };

  it('hors ligne : le stockage, sans rien demander au serveur', async () => {
    reseau(false);
    ranger({ id: UID, email: 'koh@exemple.fr' });
    let demande = false;
    const compte = await compteCourant(async () => {
      demande = true;
      return duServeur;
    });
    expect(compte).toEqual({ id: UID, email: 'koh@exemple.fr' });
    // Le point du correctif.
    expect(demande).toBe(false);
  });

  it('hors ligne SANS session rangée : on demande quand même', async () => {
    // `navigator.onLine` peut mentir dans les deux sens ; sans rien à servir,
    // une tentative vaut mieux qu'un refus.
    reseau(false);
    expect(await compteCourant(async () => duServeur)).toEqual(duServeur);
  });

  it('en ligne : c’est le serveur qui fait foi', async () => {
    reseau(true);
    ranger({ id: UID, email: 'koh@exemple.fr' });
    expect(await compteCourant(async () => duServeur)).toEqual(duServeur);
  });

  it('en ligne, personne connecté : null, et non le compte rangé', async () => {
    // Une déconnexion faite ailleurs ne doit pas être masquée par le cache.
    reseau(true);
    ranger({ id: UID, email: 'koh@exemple.fr' });
    expect(await compteCourant(async () => null)).toBeNull();
  });

  it('réseau qui ment : l’attente est bornée, le stockage prend le relais', async () => {
    // Portail captif, Wi-Fi qui ne route rien : l'appel part et ne revient
    // jamais, sans lever — aucun `catch` ne servirait.
    reseau(true);
    ranger({ id: UID, email: 'koh@exemple.fr' });
    vi.useFakeTimers();
    try {
      const promesse = compteCourant(() => new Promise(() => {}), 20);
      await vi.advanceTimersByTimeAsync(50);
      expect(await promesse).toEqual({ id: UID, email: 'koh@exemple.fr' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('appel qui lève : le stockage sait encore', async () => {
    reseau(true);
    ranger({ id: UID, email: 'koh@exemple.fr' });
    const compte = await compteCourant(async () => {
      throw new Error('Failed to fetch');
    });
    expect(compte).toEqual({ id: UID, email: 'koh@exemple.fr' });
  });
});
