/**
 * L'état de l'anti-spoiler, là où l'on s'en sert.
 *
 * Les trois réglages vivaient au fond des Réglages : on ne savait pas, depuis
 * la liste des épisodes, ce qui était masqué ni pourquoi. La pastille le dit
 * d'un coup d'œil, et s'ouvre sur les trois choix. En « Tout voir », elle
 * passe en avertissement : plus rien n'est protégé, et cela doit se voir.
 */
import { useState } from 'react';
import { Eye, ShieldCheck } from 'lucide-react';
import { Sheet } from '@mister-guiiug/dev-pwa-config/react/sheet';
import { useAppStore } from '../store/useAppStore';
import { lastWatched } from '../domain/spoiler';
import { spoilerStatus } from '../domain/spoilerModes';
import { SpoilerModePicker } from './SpoilerModePicker';

export function SpoilerStatusChip() {
  const spoiler = useAppStore(s => s.spoiler);
  const watched = useAppStore(s => s.watched);
  const [open, setOpen] = useState(false);
  const status = spoilerStatus(spoiler, lastWatched(watched));

  return (
    <>
      <button
        type="button"
        className="spoiler-chip"
        data-tone={status.tone}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {status.tone === 'warning' ? (
          <Eye size={16} aria-hidden />
        ) : (
          <ShieldCheck size={16} aria-hidden />
        )}
        <span>{status.label}</span>
      </button>
      <Sheet
        open={open}
        title="Anti-spoiler"
        closeLabel="Fermer"
        onClose={() => setOpen(false)}
      >
        <SpoilerModePicker idPrefix="spoiler-feuille" />
      </Sheet>
    </>
  );
}
