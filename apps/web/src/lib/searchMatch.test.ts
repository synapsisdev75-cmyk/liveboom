/**
 * Búsqueda de personas y publicaciones.
 * Ejecutar: npx tsx apps/web/src/lib/searchMatch.test.ts
 */
import { scorePostMatch, scoreUserMatch, searchIntent, searchTokens } from './searchMatch';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(searchTokens('Carros en arriendo').join(',') === 'carros,arriendo', 'quita palabras vacías');
assert(searchIntent('@jhon') === 'people', '@ = personas');
assert(searchIntent('#SOMOS') === 'posts', '# = publicaciones');
assert(searchIntent('carros') === 'auto', 'palabra = automático');

assert(scorePostMatch('carros', { caption: 'Vendo carro usado, buen estado' }) > 0, 'plural → singular');
assert(scorePostMatch('carro', { caption: 'Carros baratos en Villavicencio' }) > 0, 'singular → plural');
assert(scorePostMatch('arriendo', { caption: 'Se arrienda apartamento' }) > 0, 'arriendo ~ arrienda');
assert(scorePostMatch('arriendo', { caption: 'ARRIENDOS en el centro' }) > 0, 'mayúsculas');
assert(scorePostMatch('educacion', { caption: 'Clases de Educación física' }) > 0, 'sin tildes');
assert(scorePostMatch('seguimosenlalucha', { caption: 'Hoy #SeguimosEnLaLucha' }) > 0, 'hashtag');
assert(scorePostMatch('carros arriendo', { caption: 'Vendo carro' }) === 0, 'todas las palabras');
assert(scorePostMatch('agua', { caption: 'Caminando ando y vendiendo agua :heart_eyes:' }) > 0, 'con emojis');
assert(scorePostMatch('heart', { caption: 'hola :heart_eyes:' }) === 0, 'no busca dentro de :emoji:');
assert(scorePostMatch('clash', { caption: 'mira', linkTitle: 'Clash Royale torneo' }) > 0, 'título del enlace');
assert(
  scorePostMatch('vendo carro', { caption: 'Hoy vendo carro rojo' }) >
    scorePostMatch('vendo carro', { caption: 'Carro: lo vendo' }),
  'frase exacta primero',
);

assert(scoreUserMatch('yemdups', { username: 'yemdups', displayName: 'jhonatan urbano' }) === 100, 'usuario exacto');
assert(scoreUserMatch('@jhon', { username: 'jhon_guevara_yjpvks', displayName: 'jhon guevara' }) > 0, '@prefijo');
assert(scoreUserMatch('guevara', { username: 'jhon_guevara_yjpvks', displayName: 'jhon guevara' }) > 0, 'apellido');
assert(scoreUserMatch('Andrés', { username: 'carlos_andr_s', displayName: 'Carlos Andrés Rodríguez' }) > 0, 'tildes');
assert(scoreUserMatch('jhonatan urbano', { username: 'yemdups', displayName: 'jhonatan urbano' }) > 0, 'nombre completo');
assert(scoreUserMatch('carros', { username: 'jhon_guevara', displayName: 'jhon guevara' }) === 0, 'no es persona');
assert(
  scoreUserMatch('jhon', { username: 'jhon_fuentes', displayName: 'jhon fuentes' }) >
    scoreUserMatch('jhon', { username: 'xyz', displayName: 'Pedro jhon' }),
  'prefijo primero',
);

console.log('searchMatch: ok');
