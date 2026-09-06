/**
 * Le partage éphémère d'une photo — déposer, lister, éteindre, consommer.
 *
 * C'EST LA SEULE ROUTE DE CETTE APPLICATION QUI DÉPOSE UNE IMAGE SUR UN
 * SERVEUR. Toutes les autres — la feuille de partage du système,
 * l'enregistrement dans les fichiers, le QR code — donnent l'image d'appareil à
 * appareil ou ne portent qu'un lien. Celle-ci publie, pour un jour au plus et
 * une ouverture au plus. Ce n'est pas un détail d'implémentation : c'est ce que
 * l'écran doit dire avant le clic.
 *
 * LIRE, C'EST CONSOMMER, ET C'EST LE SERVEUR QUI LE GARANTIT.
 * `consume_photo_share` est un `delete … returning` : une seule instruction,
 * donc deux lecteurs simultanés ne peuvent pas obtenir la même image. Rien ici
 * ne compte les ouvertures, et rien n'aurait pu le faire correctement.
 *
 * UNE OUVERTURE DE PAGE NE CONSOMME RIEN. La consommation est un appel `rpc`,
 * c'est-à-dire un POST, déclenché par un geste. Les messageries préchargent les
 * liens qu'on leur confie : si l'affichage consommait, l'aperçu d'une
 * conversation brûlerait la photo avant que son destinataire la voie.
 *
 * BASE64 DES DEUX CÔTÉS. PostgREST ne transporte pas un `bytea` sans
 * cérémonie ; le serveur `decode()` à l'entrée et `encode()` à la sortie. Le
 * surcoût est d'un tiers sur une vignette de 120 Kio — sans commune mesure
 * avec la complexité d'un stockage séparé.
 */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseFactory } from './supabaseReferential';

/** Les types que le dépôt local produit, et les seuls que le serveur accepte. */
export const PHOTO_SHARE_MIMES = [
  'image/webp',
  'image/jpeg',
  'image/png',
] as const;

/** Ce que le serveur refuse au-delà — la borne locale, elle, est de 120 Kio. */
export const PHOTO_SHARE_MAX_BYTES = 200 * 1024;

/** Cinq actifs par compte : le sixième chasse le plus ancien, il ne le refuse pas. */
export const PHOTO_SHARE_ACTIVE_MAX = 5;

const ShareRow = z.object({
  id: z.string(),
  token: z.string(),
  label: z.string().nullable(),
  season_contestant_id: z.string().nullable(),
  created_at: z.string(),
  expires_at: z.string(),
});

/**
 * Un partage vu par celui qui l'a créé.
 *
 * PAS D'OCTETS. Le serveur n'accorde la lecture de `bytes` à personne — c'est
 * un droit de colonne, tenu par le moteur. Le propriétaire a déjà l'image sur
 * son appareil ; la relire ici n'ouvrirait qu'une porte de plus.
 */
export interface PhotoShare {
  readonly id: string;
  readonly token: string;
  readonly label: string | null;
  readonly contestantId: string | null;
  readonly createdAt: string;
  readonly expiresAt: string;
}

const SHARE_SELECT =
  'id, token, label, season_contestant_id, created_at, expires_at';

export function mapPhotoShare(input: unknown): PhotoShare {
  const row = ShareRow.parse(input);
  return {
    id: row.id,
    token: row.token,
    label: row.label,
    contestantId: row.season_contestant_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

const ConsumedRow = z.object({
  photo_base64: z.string(),
  photo_mime: z.string(),
  photo_label: z.string().nullable(),
  photo_contestant: z.string().nullable(),
});

/** La photo telle qu'un destinataire la reçoit — une fois. */
export interface ConsumedPhoto {
  readonly blob: Blob;
  readonly label: string | null;
  /**
   * Le candidat que ce portrait montre, quand le partage le disait.
   *
   * C'est ce qui permet de le poser sur la bonne fiche sans passer par les
   * fichiers de l'appareil. Une clé du RÉFÉRENTIEL PUBLIC, pas un identifiant
   * de compte — et `null` reste possible : un partage peut ne viser personne,
   * et un référentiel de démonstration ne connaîtra pas cet identifiant.
   */
  readonly contestantId: string | null;
}

/**
 * Base64 → octets, sans passer par le réseau.
 *
 * `fetch('data:…')` serait plus court mais tomberait sur la CSP `connect-src`,
 * qui ne connaît que Supabase. `atob` puis un `Uint8Array` ne demandent rien à
 * personne.
 */
export function blobFromBase64(base64: string, mime: string): Blob {
  const binaire = atob(base64);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i += 1) {
    octets[i] = binaire.charCodeAt(i);
  }
  return new Blob([octets], { type: mime });
}

/** Octets → base64, par morceaux : `String.fromCharCode(...tableau)` déborde la pile. */
export async function base64FromBlob(blob: Blob): Promise<string> {
  const octets = new Uint8Array(await blob.arrayBuffer());
  let binaire = '';
  const pas = 8 * 1024;
  for (let i = 0; i < octets.length; i += pas) {
    binaire += String.fromCharCode(...octets.subarray(i, i + pas));
  }
  return btoa(binaire);
}

export interface PhotoShareRepository {
  /** Les partages vivants du compte, les plus récents d'abord. */
  list(): Promise<PhotoShare[]>;
  /**
   * Dépose une photo pour un jour. Rend le partage créé — jeton compris, c'est
   * lui l'adresse à donner.
   */
  share(
    blob: Blob,
    label: string | null,
    contestantId: string | null
  ): Promise<PhotoShare>;
  /** Éteint un partage avant l'heure. Le `delete` EST la révocation. */
  revoke(share: PhotoShare): Promise<void>;
  /**
   * Ouvre un lien — et le détruit. Rend `null` quand il n'ouvre rien :
   * inconnu, déjà ouvert ou périmé, le serveur répond la même chose aux trois,
   * et il ne peut pas répondre autrement puisqu'il n'en garde aucune trace.
   */
  consume(token: string): Promise<ConsumedPhoto | null>;
}

/** Injectable : les tests passent un client de fantaisie. */
export function createPhotoShareRepository(
  getClient: () => Promise<SupabaseClient>
): PhotoShareRepository {
  const fail = (what: string, message: string): never => {
    throw new Error(`${what} : ${message}`);
  };

  return {
    async list() {
      const supabase = await getClient();
      // AUCUN filtre sur le propriétaire : la RLS s'en charge, et `owner_id`
      // n'est même pas lisible. Un `.eq('owner_id', …)` échouerait — c'est
      // voulu, il n'y a qu'une bonne façon de poser cette question.
      const { data, error } = await supabase
        .from('photo_shares')
        .select(SHARE_SELECT)
        .order('created_at', { ascending: false });
      if (error) fail('lecture des partages', error.message);
      return (data ?? []).map(mapPhotoShare);
    },

    async share(blob, label, contestantId) {
      const supabase = await getClient();
      if (blob.size > PHOTO_SHARE_MAX_BYTES) {
        fail('partage', 'cette image est trop lourde pour un partage');
      }
      const mime = blob.type;
      if (!PHOTO_SHARE_MIMES.some(known => known === mime)) {
        fail('partage', `type d’image inattendu : ${mime || 'inconnu'}`);
      }
      const { data, error } = await supabase.rpc('create_photo_share', {
        photo_base64: await base64FromBlob(blob),
        photo_mime: mime,
        photo_label: label,
        contestant: contestantId,
      });
      if (error) fail('partage', error.message);
      const token = z.string().parse(data);
      // Le jeton seul ne suffit pas à l'écran : il lui faut aussi l'échéance,
      // et c'est le SERVEUR qui la pose. La calculer ici la ferait dériver de
      // l'horloge du navigateur, qui n'est pas celle qui décide.
      const { data: rows, error: relecture } = await supabase
        .from('photo_shares')
        .select(SHARE_SELECT)
        .eq('token', token)
        .single();
      if (relecture) fail('partage', relecture.message);
      return mapPhotoShare(rows);
    },

    async revoke(share) {
      const supabase = await getClient();
      const { error } = await supabase
        .from('photo_shares')
        .delete()
        .eq('id', share.id);
      if (error) fail('retrait du partage', error.message);
    },

    async consume(token) {
      const supabase = await getClient();
      const { data, error } = await supabase.rpc('consume_photo_share', {
        share_token: token,
      });
      if (error) fail('ouverture du partage', error.message);
      const rows = (data as unknown[] | null | undefined) ?? [];
      const first = rows[0];
      if (first === undefined) return null;
      const row = ConsumedRow.parse(first);
      return {
        blob: blobFromBase64(row.photo_base64, row.photo_mime),
        label: row.photo_label,
        contestantId: row.photo_contestant,
      };
    },
  };
}

export const photoShareRepository = createPhotoShareRepository(() =>
  supabaseFactory.getClient()
);
