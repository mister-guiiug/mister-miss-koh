import { describe, expect, it } from 'vitest';
import {
  QR_MAX_BYTES,
  contestantUrl,
  photoFileName,
  sharedUrl,
} from './sharing';

describe('le nom du fichier partagé', () => {
  it('nomme la personne, sans accent ni espace', () => {
    expect(photoFileName('Éloïse Da Silva', 'image/jpeg')).toBe(
      'portrait-eloise-da-silva.jpg'
    );
  });

  it('suit le type RÉEL du blob, pas celui du fichier d’origine', () => {
    // L'image a été ré-encodée en chemin : proposer « .png » parce que la
    // photo de départ en était un donnerait un fichier que rien n'ouvre bien.
    expect(photoFileName('Élouan', 'image/webp')).toBe('portrait-elouan.webp');
    expect(photoFileName('Élouan', 'image/png')).toBe('portrait-elouan.png');
  });

  it('ignore les paramètres du type MIME', () => {
    expect(photoFileName('Ael', 'image/jpeg; charset=binary')).toBe(
      'portrait-ael.jpg'
    );
  });

  it('déduit un sous-type inconnu, et refuse d’inventer au-delà', () => {
    expect(photoFileName('Ael', 'image/heic')).toBe('portrait-ael.heic');
    expect(photoFileName('Ael', 'application/octet-stream')).toBe(
      'portrait-ael.img'
    );
  });

  it('garde un nom quand il ne reste rien à mettre en tiret', () => {
    // Un nom entièrement fait de ponctuation ne doit pas donner
    // « portrait-.jpg ».
    expect(photoFileName('«»', 'image/jpeg')).toBe('portrait-candidat.jpg');
  });
});

describe('le lien d’une fiche', () => {
  it('pose la route dans le FRAGMENT — l’application est en HashRouter', () => {
    expect(
      contestantUrl('https://exemple.test/mister-miss-koh/', 'c-ael')
    ).toBe('https://exemple.test/mister-miss-koh/#/candidats/c-ael');
  });

  it('ajoute la barre manquante plutôt que de coller la base au fragment', () => {
    expect(contestantUrl('https://exemple.test/koh', 'c-ael')).toBe(
      'https://exemple.test/koh/#/candidats/c-ael'
    );
  });

  it('encode un identifiant qui contiendrait autre chose que des lettres', () => {
    expect(contestantUrl('https://exemple.test/', 'c/ael?x')).toBe(
      'https://exemple.test/#/candidats/c%2Fael%3Fx'
    );
  });
});

describe('le lien d’un partage', () => {
  it('inscrit la PORTÉE dans l’adresse — le jeton ne la dit pas', () => {
    // Le serveur a deux lecteurs, un par portée, et rien dans un jeton ne
    // désigne le sien : sans cette marque, ouvrir un lien demanderait
    // d'essayer l'un puis l'autre.
    expect(sharedUrl('https://exemple.test/koh/', 'note', 'jeton')).toBe(
      'https://exemple.test/koh/#/partage/note/jeton'
    );
    expect(sharedUrl('https://exemple.test/koh/', 'notes', 'jeton')).toBe(
      'https://exemple.test/koh/#/partage/notes/jeton'
    );
  });

  it('laisse un jeton base64url intact, et encode le reste', () => {
    // `generate_share_token` rend du base64url : lettres, chiffres, « - » et
    // « _ », qu'aucun encodage ne doit déformer.
    const jeton = 'aB3-_xYz';
    expect(sharedUrl('https://exemple.test/', 'note', jeton)).toBe(
      `https://exemple.test/#/partage/note/${jeton}`
    );
    expect(sharedUrl('https://exemple.test/', 'note', 'a/b')).toBe(
      'https://exemple.test/#/partage/note/a%2Fb'
    );
  });
});

describe('la capacité d’un QR code', () => {
  it('est celle du format, et un portrait la dépasse largement', () => {
    // Ce n'est pas une limite de notre encodeur : version 40, correction
    // « L », mode binaire. La vignette la plus légère qu'on produise en pèse
    // plusieurs fois plus — c'est ce que l'écran affiche pour l'expliquer.
    expect(QR_MAX_BYTES).toBe(2953);
  });
});
