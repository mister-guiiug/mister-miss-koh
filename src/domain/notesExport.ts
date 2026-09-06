/**
 * Mettre ses notes en un document — pour les envoyer ou les garder.
 *
 * POURQUOI UN DOCUMENT, PUISQU'IL Y A DÉJÀ UN LIEN. Un lien publie : il ouvre
 * la lecture à qui l'obtient, il vit sur le serveur, il faut penser à le
 * révoquer. Un document, lui, ne publie rien — il part par la feuille de
 * partage du système ou se range dans les fichiers, d'appareil à appareil, et
 * il se lit sans compte, sans réseau, dans dix ans. Les deux répondent à des
 * besoins différents, et l'écran ne les confond pas.
 *
 * DEUX FORMES, PARCE QUE DEUX DESTINATIONS. Le Markdown va dans un fichier :
 * il porte des titres, il se relit tel quel et se recolle ailleurs. Le texte
 * brut va dans une conversation, où les dièses et les astérisques d'un
 * Markdown non rendu sont du bruit.
 *
 * LE CORPS N'EST JAMAIS ÉCHAPPÉ. La colonne `body` contient déjà du Markdown —
 * c'est ce que le schéma dit d'elle. L'échapper transformerait la mise en forme
 * de son auteur en ponctuation. Ce qu'on échappe, ce sont les LIBELLÉS qu'on
 * insère dans des titres : un nom n'est pas censé ouvrir une syntaxe.
 */
import { escapeInline } from '@mister-guiiug/dev-pwa-config/markdown';
import { formatDate, slugify } from '@mister-guiiug/dev-pwa-config/format';

export interface ExportableNote {
  readonly title: string | null;
  readonly body: string;
  readonly rating: number | null;
  readonly updatedAt: string;
  /** Ce sur quoi porte la note, déjà nommé par l'appelant. */
  readonly about: string;
}

/** « ★★★☆☆ », ou rien du tout : une note sans étoiles n'en vaut pas zéro. */
export function stars(rating: number | null): string {
  if (rating === null || rating < 1) return '';
  const filled = Math.min(5, Math.round(rating));
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

function line(note: ExportableNote): string {
  const rated = stars(note.rating);
  const date = `modifiée le ${formatDate(note.updatedAt)}`;
  return rated ? `${rated} · ${date}` : date;
}

/** Un document Markdown : un titre, puis une section par note. */
export function notesToMarkdown(
  notes: readonly ExportableNote[],
  heading: string
): string {
  const parts = [`# ${escapeInline(heading)}`, ''];
  for (const note of notes) {
    parts.push(`## ${escapeInline(note.about)}`, '', line(note), '');
    if (note.title) parts.push(`**${escapeInline(note.title)}**`, '');
    if (note.body.trim()) parts.push(note.body.trim(), '');
  }
  return parts.join('\n').trimEnd() + '\n';
}

/** Le même contenu, sans syntaxe — pour une conversation. */
export function notesToText(
  notes: readonly ExportableNote[],
  heading: string
): string {
  const parts = [heading, ''];
  for (const note of notes) {
    const rated = stars(note.rating);
    parts.push(rated ? `${note.about} — ${rated}` : note.about);
    if (note.title) parts.push(note.title);
    if (note.body.trim()) parts.push(note.body.trim());
    parts.push('');
  }
  return parts.join('\n').trimEnd() + '\n';
}

/** `notes-koh-lanta-all-stars.md` — le sujet, pas la date d'export. */
export function notesFileName(heading: string): string {
  const slug = slugify(heading);
  return `notes-${slug || 'partagees'}.md`;
}
