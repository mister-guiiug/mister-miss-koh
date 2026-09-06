/**
 * Le profil du compte courant : un pseudonyme, et parfois une adresse.
 *
 * IL N'EN EXISTE AUCUN TANT QU'ON N'EN CRÉE PAS. Rien ne peuple `profiles` —
 * ni déclencheur, ni inscription — et `pseudonym` est `not null` sans valeur par
 * défaut : on ne PEUT pas en fabriquer un sans demander un nom. C'est voulu,
 * mais ce n'était dit nulle part, et une note partagée s'en trouvait signée
 * « quelqu'un qui n'a pas choisi de pseudonyme ».
 *
 * `upsert` PLUTÔT QUE « lire puis choisir ». La première écriture crée, les
 * suivantes corrigent ; deux politiques RLS distinctes l'autorisent
 * (`profils_creation` et `profils_maj`), toutes deux sur `id = auth.uid()`. Le
 * client n'a donc pas à savoir s'il crée ou s'il modifie — et deux onglets qui
 * enregistrent en même temps ne fabriquent pas deux lignes.
 *
 * LA DISPONIBILITÉ SE DEMANDE AU SERVEUR, PAS À LA TABLE. `handle_is_available`
 * est `security definer` : elle voit les profils des autres et la liste des
 * termes réservés, que l'appelant ne voit pas. Interroger `profiles` depuis le
 * client répondrait « disponible » pour un identifiant déjà pris — la RLS cache
 * la ligne qui le détient — et le doublon serait refusé plus tard, par la
 * contrainte, avec un message technique et après la saisie.
 */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseFactory } from './supabaseReferential';

const ProfileRow = z.object({
  id: z.string(),
  pseudonym: z.string(),
  public_handle: z.string().nullable(),
  updated_at: z.string(),
});

export interface Profile {
  readonly id: string;
  readonly pseudonym: string;
  /** L'adresse publique — facultative, unique quand elle existe. */
  readonly handle: string | null;
  readonly updatedAt: string;
}

export interface ProfileDraft {
  readonly pseudonym: string;
  readonly handle: string | null;
}

const SELECT = 'id, pseudonym, public_handle, updated_at';

export function mapProfile(input: unknown): Profile {
  const row = ProfileRow.parse(input);
  return {
    id: row.id,
    pseudonym: row.pseudonym,
    handle: row.public_handle,
    updatedAt: row.updated_at,
  };
}

export interface ProfileRepository {
  /** Le profil du compte, ou `null` — l'absence est un état, pas une panne. */
  load(): Promise<Profile | null>;
  save(draft: ProfileDraft): Promise<Profile>;
  /** `false` si l'identifiant est pris, réservé, ou mal formé. */
  handleAvailable(candidate: string): Promise<boolean>;
}

/** Injectable : les tests passent un client de fantaisie. */
export function createProfileRepository(
  getClient: () => Promise<SupabaseClient>
): ProfileRepository {
  const fail = (what: string, message: string): never => {
    throw new Error(`${what} : ${message}`);
  };

  const userOf = async (
    supabase: SupabaseClient,
    what: string
  ): Promise<string> => {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? fail(what, 'aucune session');
  };

  return {
    async load() {
      const supabase = await getClient();
      const userId = await userOf(supabase, 'lecture du profil');
      const { data, error } = await supabase
        .from('profiles')
        .select(SELECT)
        .eq('id', userId)
        .maybeSingle();
      if (error) fail('lecture du profil', error.message);
      return data ? mapProfile(data) : null;
    },

    async save(draft) {
      const supabase = await getClient();
      const userId = await userOf(supabase, 'enregistrement du profil');
      const { data, error } = await supabase
        .from('profiles')
        .upsert(
          {
            id: userId,
            pseudonym: draft.pseudonym,
            // Une chaîne vide n'est pas une adresse : la colonne est
            // `unique`, et deux profils sans identifiant s'y heurteraient.
            public_handle: draft.handle || null,
          },
          { onConflict: 'id' }
        )
        .select(SELECT)
        .single();
      if (error) fail('enregistrement du profil', error.message);
      return mapProfile(data);
    },

    async handleAvailable(candidate) {
      const supabase = await getClient();
      const { data, error } = await supabase.rpc('handle_is_available', {
        candidate,
      });
      if (error) fail('vérification de l’identifiant', error.message);
      return data === true;
    },
  };
}

export const profileRepository = createProfileRepository(() =>
  supabaseFactory.getClient()
);
