/**
 * « Où en êtes-vous ? », posé au lecteur de notes qui ne sont pas les siennes.
 *
 * Qui ouvre un lien de partage arrive souvent sans rien avoir coché : sa
 * limite est à zéro, et tout ce qu'on lui montre serait masqué sans qu'il
 * sache pourquoi. On ne pose la question que s'il y a vraiment quelque chose
 * de masqué ; y répondre fixe son suivi, comme cocher des épisodes.
 */
import { Card } from '@mister-guiiug/dev-pwa-config/react/card';
import { isSpoiler } from '../domain/spoiler';
import { noteRevealEpisode } from '../domain/noteSpoiler';
import { useAppStore } from '../store/useAppStore';
import { useSpoilerLimit } from '../hooks/useSpoilerLimit';
import { WatchedPicker } from './WatchedPicker';
import type { ReadableNote } from './ReadNoteCard';

export function ReaderLimitPrompt({
  notes,
}: {
  notes: readonly ReadableNote[];
}) {
  const referential = useAppStore(s => s.referential);
  const limit = useSpoilerLimit();
  const masked = notes.filter(n =>
    isSpoiler(noteRevealEpisode(referential, n), limit)
  ).length;
  if (masked === 0 || !referential) return null;

  return (
    <Card className="reader-limit">
      <p>
        <strong>Où en êtes-vous de la saison ?</strong>{' '}
        {masked > 1
          ? `${masked} notes ont été écrites après ce que vous avez vu : elles restent masquées.`
          : 'Une note a été écrite après ce que vous avez vu : elle reste masquée.'}
      </p>
      <WatchedPicker label="J’ai vu jusqu’à" />
    </Card>
  );
}
