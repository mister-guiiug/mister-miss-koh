// Setup Vitest partagé : jest-dom + stub matchMedia + mocks virtual:pwa-register
// + localStorage en mémoire (fourni par le socle).
import '@mister-guiiug/dev-pwa-config/vitest-setup';

/**
 * `Blob.arrayBuffer` — un MANQUE de jsdom, pas une limite des navigateurs.
 *
 * Tous les navigateurs visés l'implémentent depuis 2020 ; jsdom, non. Sans ce
 * comblement, le partage éphémère d'une photo serait éprouvé contre une
 * plateforme plus pauvre que la vraie — et il faudrait écrire dans le code de
 * production un détour dont personne n'a besoin en production.
 */
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const lecteur = new FileReader();
      lecteur.onload = () => resolve(lecteur.result as ArrayBuffer);
      lecteur.onerror = () =>
        reject(lecteur.error ?? new Error('blob illisible'));
      lecteur.readAsArrayBuffer(this);
    });
  };
}
