/**
 * Choisir le portrait d'un candidat — depuis VOS images, et de nulle part
 * ailleurs.
 *
 * L'application ne va chercher aucune photo : celles de l'émission sont des
 * œuvres protégées représentant des personnes identifiables, et ce dépôt
 * annonce qu'il n'en reproduit aucune. Ce que vous déposez ici reste sur cet
 * appareil, ré-encodé en vignette et débarrassé de ses métadonnées.
 */
import { useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import type { Contestant } from '../domain/referential';
import { usePhotosStore } from '../store/usePhotosStore';

export function PhotoPicker({ contestant }: { contestant: Contestant }) {
  const url = usePhotosStore(s => s.urls[contestant.id]);
  const attach = usePhotosStore(s => s.attach);
  const detach = usePhotosStore(s => s.detach);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Vidé tout de suite : sans cela, rechoisir LE MÊME fichier après un
    // retrait ne déclencherait aucun changement.
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      await attach(contestant.id, file);
      toast.success('Portrait enregistré sur cet appareil.');
    } catch {
      toast.error('Cette image n’a pas pu être lue.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="photo-picker">
      {/* L'input reste dans l'ordre de tabulation (masqué, pas retiré) ; le
          contour au focus est porté par l'étiquette. */}
      <label className="photo-button" data-busy={busy ? '' : undefined}>
        <Camera size={16} aria-hidden />
        <span>
          {busy
            ? 'Enregistrement…'
            : url
              ? 'Remplacer la photo'
              : 'Ajouter une photo'}
        </span>
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={busy}
          onChange={e => void onFile(e)}
        />
      </label>

      {url && (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void detach(contestant.id)}
        >
          <Trash2 size={16} aria-hidden />
          Retirer
        </Button>
      )}

      <p className="muted">
        Votre image reste sur cet appareil : l’application n’en publie aucune et
        n’en télécharge aucune.
      </p>
    </div>
  );
}
