/**
 * Le bouton « Relire Wikipédia » ne s'affiche que pour un relecteur.
 *
 * Chacun peut lire ses propres lignes de `user_roles` ; personne ne peut s'en
 * écrire. L'absence de ligne suffit à cacher le bouton. La fonction d'import
 * revérifie le rôle avec la clé de service : ce fichier ne fait qu'éviter
 * d'offrir un geste que le serveur refuserait.
 */
import { authAvailable } from './auth';
import { supabaseFactory } from './supabaseReferential';

export async function isReviewer(): Promise<boolean> {
  if (!authAvailable) return false;
  const client = await supabaseFactory.getClient();
  const { data: sessionData } = await client.auth.getSession();
  if (!sessionData.session) return false;
  const { data, error } = await client
    .from('user_roles')
    .select('role')
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}
