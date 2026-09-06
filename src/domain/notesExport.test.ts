import { describe, expect, it } from 'vitest';
import {
  notesFileName,
  notesToMarkdown,
  notesToText,
  stars,
  type ExportableNote,
} from './notesExport';

const note = (over: Partial<ExportableNote> = {}): ExportableNote => ({
  title: null,
  body: 'Elle a tenu le poteau vingt minutes.',
  rating: null,
  updatedAt: '2026-09-06T14:30:00.000Z',
  about: 'Joana',
  ...over,
});

describe('les étoiles', () => {
  it('ne rend rien sans note — une absence ne vaut pas zéro', () => {
    expect(stars(null)).toBe('');
    expect(stars(0)).toBe('');
  });

  it('rend cinq caractères, pleins puis vides', () => {
    expect(stars(3)).toBe('★★★☆☆');
    expect(stars(5)).toBe('★★★★★');
  });

  it('ne déborde pas si le serveur rendait davantage', () => {
    expect(stars(9)).toBe('★★★★★');
  });
});

describe('le document Markdown', () => {
  it('titre, cible, date, corps — dans cet ordre', () => {
    const document = notesToMarkdown(
      [note({ title: 'Sacrée poigne', rating: 4 })],
      'Mes notes — Koh-Lanta'
    );

    expect(document).toBe(
      [
        '# Mes notes — Koh-Lanta',
        '',
        '## Joana',
        '',
        '★★★★☆ · modifiée le 6 sept. 2026',
        '',
        '**Sacrée poigne**',
        '',
        'Elle a tenu le poteau vingt minutes.',
        '',
      ].join('\n')
    );
  });

  it('échappe les LIBELLÉS, jamais le corps', () => {
    // `body` est déjà du Markdown : l'échapper transformerait la mise en
    // forme de son auteur en ponctuation.
    const document = notesToMarkdown(
      [
        note({
          about: 'Jean-Marc [le stratège]',
          title: 'Un *retournement*',
          body: 'Il a **tout** renversé.',
        }),
      ],
      'Notes'
    );

    expect(document).toContain('## Jean-Marc \\[le stratège\\]');
    expect(document).toContain('**Un \\*retournement\\***');
    expect(document).toContain('Il a **tout** renversé.');
  });

  it('sait n’avoir ni titre ni corps sans laisser de trous', () => {
    const document = notesToMarkdown([note({ body: '   ' })], 'Notes');
    expect(document).toBe(
      ['# Notes', '', '## Joana', '', 'modifiée le 6 sept. 2026', ''].join('\n')
    );
  });

  it('enchaîne les notes sans les coller', () => {
    const document = notesToMarkdown(
      [note(), note({ about: 'Maxime', body: 'Sorti au 33e jour.' })],
      'Notes'
    );
    expect(document).toContain('## Joana');
    expect(document).toContain('## Maxime');
    expect(document.endsWith('Sorti au 33e jour.\n')).toBe(true);
  });
});

describe('le texte brut', () => {
  it('n’a aucune syntaxe — il part dans une conversation', () => {
    const texte = notesToText(
      [note({ title: 'Sacrée poigne', rating: 4 })],
      'Mes notes'
    );

    expect(texte).toBe(
      [
        'Mes notes',
        '',
        'Joana — ★★★★☆',
        'Sacrée poigne',
        'Elle a tenu le poteau vingt minutes.',
        '',
      ].join('\n')
    );
    expect(texte).not.toContain('#');
    expect(texte).not.toContain('**');
  });

  it('laisse les crochets d’un nom tranquilles', () => {
    const texte = notesToText(
      [note({ about: 'Jean-Marc [le stratège]' })],
      'N'
    );
    expect(texte).toContain('Jean-Marc [le stratège]');
  });
});

describe('le nom du fichier', () => {
  it('dit le sujet, sans accent ni espace', () => {
    expect(notesFileName('Mes notes — Koh-Lanta All Stars')).toBe(
      'notes-mes-notes-koh-lanta-all-stars.md'
    );
  });

  it('garde un nom quand il ne reste rien à mettre en tiret', () => {
    expect(notesFileName('«»')).toBe('notes-partagees.md');
  });
});
