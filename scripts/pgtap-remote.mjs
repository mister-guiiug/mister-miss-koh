#!/usr/bin/env node
/**
 * Joue un fichier pgTAP de `supabase/tests/` contre la base LIÉE, sans Docker.
 *
 * `supabase test db` exige `pg_prove` dans un conteneur, et Docker ne démarre
 * pas partout. `supabase db query --linked` exécute bien le fichier, mais ne
 * renvoie que le dernier jeu de lignes : les verdicts intermédiaires de pgTAP
 * se perdent. Ce lanceur réécrit donc chaque assertion pour déposer son
 * verdict dans une table temporaire, que la dernière requête renvoie d'un
 * bloc. Même fichier, même plan, même `rollback` final : rien ne reste.
 *
 * Deux faits vérifiés le 05/09/2026 : pgTAP enregistre ses verdicts sous
 * `set role anon` sans droit supplémentaire ; la table de collecte, elle,
 * appartient à `postgres` et doit être ouverte aux rôles de l'API.
 *
 * Prérequis : `supabase link` fait, et `SUPABASE_ACCESS_TOKEN` dans
 * l'environnement (ou une session `supabase login`).
 *
 * Usage : node scripts/pgtap-remote.mjs <fichier.test.sql>
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ASSERTIONS =
  /^select (is|isnt|ok|lives_ok|throws_ok|hasnt_column|has_column|plan)\(/gm;

const name = process.argv[2] ?? 'rls.test.sql';
const source = readFileSync(
  new URL(`../supabase/tests/${name}`, import.meta.url),
  'utf8'
);

const rewritten = source
  .replace(
    /^begin;$/m,
    [
      'begin;',
      'create temp table tap (ord serial, line text);',
      '-- Les tests changent de rôle : la collecte doit leur rester ouverte.',
      'grant select, insert on tap to anon, authenticated;',
      'grant usage on sequence tap_ord_seq to anon, authenticated;',
    ].join('\n')
  )
  .replace(ASSERTIONS, 'insert into tap (line) select $1(')
  .replace(
    /^select \* from finish\(\);$/m,
    [
      "select string_agg(line, E'\\n' order by ord) as tap from tap;",
      'select * from finish();',
    ].join('\n')
  );

const file = join(mkdtempSync(join(tmpdir(), 'koh-pgtap-')), 'remote.sql');
writeFileSync(file, rewritten);

const run = spawnSync('supabase', ['db', 'query', '--linked', '--file', file], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

const out = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
// `db query` rend du JSON précédé de bruit (rôle de connexion, avertissements
// Docker) : on ne lit que la valeur de la colonne `tap`.
const match = /"tap":\s*("(?:[^"\\]|\\.)*")/.exec(out);

if (!match) {
  const reason = /"message":\s*"((?:[^"\\]|\\.)*)"/.exec(out);
  console.error(`Aucun verdict renvoyé pour ${name}.`);
  console.error(
    reason
      ? JSON.parse(`"${reason[1]}"`)
      : out.trim().split('\n').slice(-5).join('\n')
  );
  process.exit(2);
}

const lines = JSON.parse(match[1]).split('\n');
for (const line of lines) console.log(line);

const failed = lines.filter(l => l.startsWith('not ok')).length;
const passed = lines.filter(l => /^ok \d/.test(l)).length;
const planned = Number(/^1\.\.(\d+)$/.exec(lines[0] ?? '')?.[1] ?? 0);

console.log(`\n${name} — ${passed} ok, ${failed} not ok, ${planned} prévues`);
process.exit(failed === 0 && passed === planned ? 0 : 1);
