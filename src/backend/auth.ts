/**
 * La session — et ce que l'application refuse de savoir.
 *
 * AUCUN MOT DE PASSE N'EST DEMANDÉ, JAMAIS. L'identification se fait par lien
 * envoyé à une adresse : l'application ne voit passer aucun secret, n'en
 * stocke aucun, et il n'y a donc rien à perdre en cas de fuite du bundle. Un
 * champ « mot de passe » aurait été plus familier ; il aurait aussi apporté
 * une réinitialisation, un stockage, et une surface d'attaque que ce produit
 * n'a aucune raison d'avoir.
 *
 * LA SESSION NE DONNE ACCÈS QU'À SOI. Ce fichier ne pose aucune règle
 * d'autorisation : elles vivent dans les politiques RLS, éprouvées par 22
 * assertions pgTAP. Un contrôle écrit ici serait un second endroit où se
 * tromper, et le premier à être contourné.
 */
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { supabaseFactory } from './supabaseReferential';
import { BACKEND } from './config';

export interface Account {
  readonly id: string;
  readonly email: string | null;
}

/** `null` = personne n'est connecté ; ce n'est pas une erreur. */
export function accountOf(user: User | null | undefined): Account | null {
  if (!user) return null;
  return { id: user.id, email: user.email ?? null };
}

export const authAvailable =
  BACKEND === 'supabase' && supabaseFactory.isConfigured();

async function client(): Promise<SupabaseClient> {
  if (!authAvailable) {
    throw new Error(
      'aucun backend configuré : la connexion demande une base Supabase'
    );
  }
  return supabaseFactory.getClient();
}

/**
 * Envoie un lien de connexion.
 *
 * `emailRedirectTo` doit être autorisé côté projet, sinon Supabase renvoie
 * vers son URL par défaut et l'utilisateur atterrit ailleurs. On le calcule
 * depuis l'origine servie, jamais depuis une constante : le même bundle tourne
 * en local et sur Pages.
 */
export async function sendMagicLink(email: string): Promise<void> {
  const supabase = await client();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
      // Le lien vaut aussi INSCRIPTION : il n'existe aucun autre parcours pour
      // créer un compte, et le refuser ici fermerait la porte à tout le monde.
      // Une adresse mal tapée ne coûte qu'un compte vide, jamais confirmé.
      shouldCreateUser: true,
    },
  });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  const supabase = await client();
  await supabase.auth.signOut();
}

export async function currentAccount(): Promise<Account | null> {
  if (!authAvailable) return null;
  const supabase = await client();
  const { data } = await supabase.auth.getUser();
  return accountOf(data.user);
}

/**
 * Suit la session et rend de quoi se désabonner.
 *
 * Le lien de connexion revient sur l'application avec un jeton dans l'URL :
 * c'est `supabase-js` qui le consomme au démarrage, et cet abonnement qui
 * apprend à l'interface que quelqu'un est entré.
 */
export async function watchSession(
  onChange: (account: Account | null) => void
): Promise<() => void> {
  if (!authAvailable) return () => {};
  const supabase = await client();
  const { data } = supabase.auth.onAuthStateChange(
    (_event: string, session: Session | null) => {
      onChange(accountOf(session?.user));
    }
  );
  return () => data.subscription.unsubscribe();
}
