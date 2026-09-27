import { repoUrl } from '@mister-guiiug/dev-pwa-config/apps-catalog';

/**
 * Le dépôt de l'app. L'URL se calcule depuis l'id : une adresse recopiée
 * diverge sans que personne ne le voie. Le lien de soutien vient du catalogue.
 */
export const APP_ID = 'mister-miss-koh';
export const REPO_URL = repoUrl(APP_ID);
