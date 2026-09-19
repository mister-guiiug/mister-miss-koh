/**
 * Exporter tous les portraits déposés, en une archive.
 *
 * MÊME PRINCIPE QU'UNITAIREMENT. « Enregistrer l'image » d'une fiche dépose un
 * fichier dans vos téléchargements, sans rien envoyer nulle part ; ceci fait
 * la même chose pour tous à la fois. Rien ne part sur un serveur, ici non plus.
 *
 * LES OCTETS SE RELISENT AU CLIC, pas au montage. Garder dix-huit portraits en
 * mémoire pour un export qui n'aura peut-être jamais lieu, c'est payer
 * d'avance — le magasin ne tient que des URL d'objet, et `read` va rechercher
 * le blob dans IndexedDB.
 */
import { useState } from 'react';
import { Images } from 'lucide-react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import { downloadBlob, dateSlug } from '@mister-guiiug/dev-pwa-config/download';
import { GESTES, trackEvent } from '@mister-guiiug/dev-pwa-config/analytics';
import { useAppStore } from '../store/useAppStore';
import { usePhotosStore } from '../store/usePhotosStore';
import { archiveName, photoEntries } from '../domain/photosExport';
import { buildZip } from '../domain/zip';

export function PhotosExport() {
  const referential = useAppStore(s => s.referential);
  const urls = usePhotosStore(s => s.urls);
  const read = usePhotosStore(s => s.read);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const deposes = Object.keys(urls).length;

  const exporter = async () => {
    if (!referential) return;
    setBusy(true);
    try {
      const portraits = [];
      for (const id of Object.keys(urls)) {
        const blob = await read(id);
        // Une URL sans blob n'est pas une erreur : la base a pu être vidée à
        // moitié. On exporte ce qui existe, sans réparer ni se plaindre.
        if (!blob) continue;
        portraits.push({
          contestantId: id,
          bytes: new Uint8Array(await blob.arrayBuffer()),
          mime: blob.type,
        });
      }

      const entries = photoEntries(referential, portraits);
      if (entries.length === 0) {
        toast.error('Aucun portrait n’a pu être relu.');
        return;
      }

      const archive = buildZip(entries);
      const nom = archiveName(referential.season.name, dateSlug());
      if (
        !downloadBlob(new Blob([archive], { type: 'application/zip' }), nom)
      ) {
        toast.error('L’export n’a pas pu démarrer.');
        return;
      }
      /*
       * APRÈS LES DEUX SORTIES PRÉMATURÉES — aucune image relue, ou
       * téléchargement refusé par le navigateur : ni l'une ni l'autre n'est un
       * export. Le NOMBRE de portraits ne part pas : il dit combien de
       * candidats l'utilisateur a photographiés, et l'archive, elle, ne quitte
       * jamais l'appareil.
       */
      trackEvent(GESTES.EXPORT, { format: 'zip' });
      toast.success(
        `${entries.length} portrait${entries.length > 1 ? 's' : ''} exporté${entries.length > 1 ? 's' : ''}.`
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="muted">
        {deposes === 0
          ? 'Aucun portrait déposé pour l’instant. Les portraits s’ajoutent depuis la fiche d’un candidat, et restent sur cet appareil.'
          : `${deposes} portrait${deposes > 1 ? 's' : ''} sur cet appareil. L’archive les rassemble tels quels — rien n’est envoyé nulle part.`}
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={deposes === 0 || busy || !referential}
        onClick={() => void exporter()}
      >
        <Images size={16} aria-hidden />
        {busy ? 'Préparation…' : 'Exporter les portraits'}
      </Button>
    </>
  );
}
