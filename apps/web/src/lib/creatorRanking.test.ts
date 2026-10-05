/**
 * Recomendación de creadores (zona + señales sociales).
 * Ejecutar: npx tsx apps/web/src/lib/creatorRanking.test.ts
 */
import {
  emptySignals,
  pickDiverse,
  reasonLabel,
  scoreCandidate,
  stableJitter,
  type CandidateSignals,
} from './creatorRanking';
import { buildPublicGeo, countryCodeFor, geoKeyPart, sameGeoKeys } from './geoKeys';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function signals(patch: Partial<CandidateSignals>): CandidateSignals {
  return { ...emptySignals(), ...patch };
}

// Claves de zona
assert(geoKeyPart('Bogotá D.C.') === 'bogota', 'Bogotá D.C. → bogota');
assert(geoKeyPart('Departamento del Valle del Cauca') === 'valle_del_cauca', 'quita «Departamento del»');
assert(geoKeyPart('Medellín') === 'medellin', 'sin tildes');
assert(countryCodeFor('Colombia') === 'co', 'Colombia → co');
assert(countryCodeFor('Whatever', 'MX') === 'mx', 'código ISO tiene prioridad');

const ip = buildPublicGeo({ city: 'Bogotá', region: 'Bogota D.C.', country: 'Colombia', countryCode: 'CO', source: 'ip' });
const gps = buildPublicGeo({ city: 'Bogota', region: 'Bogotá D.C.', country: 'Colombia', source: 'gps' });
assert(ip?.cityKey === 'co:bogota' && ip.regionKey === 'co:bogota', 'claves IP');
assert(sameGeoKeys(ip, gps), 'IP y GPS de la misma ciudad coinciden');
assert(buildPublicGeo({ source: 'ip' }) === null, 'sin país no hay zona');
const meta = buildPublicGeo({ city: 'Villavicencio', region: 'Meta Department', country: 'Colombia', countryCode: 'CO', source: 'ip' });
assert(meta?.region === 'Meta' && meta.regionKey === 'co:meta', 'Meta Department → Meta');
const metaGps = buildPublicGeo({ city: 'Perímetro Urbano Villavicencio', region: 'Meta', country: 'Colombia', source: 'gps' });
assert(metaGps?.city === 'Villavicencio' && sameGeoKeys(meta, metaGps), 'GPS «Perímetro Urbano» = IP misma ciudad');

// Puntaje
const friend = scoreCandidate(signals({ isFriend: true }), 'sidebar');
const sameCity = scoreCandidate(signals({ sameCity: true, sameRegion: true, sameCountry: true }), 'sidebar');
const sameCountry = scoreCandidate(signals({ sameCountry: true }), 'sidebar');
const nothing = scoreCandidate(signals({}), 'sidebar');
assert(friend.kind === 'friend' && friend.score > sameCity.score, 'amigo pesa más que ciudad');
assert(sameCity.kind === 'city' && sameCity.score > sameCountry.score, 'ciudad › país');
assert(sameCountry.score > nothing.score && nothing.kind === 'suggested', 'país › nada');

const mutualThree = scoreCandidate(signals({ mutualNames: ['Ana', 'Luis', 'Sara'] }), 'sidebar');
const mutualOne = scoreCandidate(signals({ mutualNames: ['Ana'] }), 'sidebar');
assert(mutualThree.score > mutualOne.score && mutualThree.kind === 'mutual', 'más seguidos en común, más puntaje');

const cityInFeatured = scoreCandidate(signals({ sameCity: true }), 'featured');
const cityInSocial = scoreCandidate(signals({ sameCity: true }), 'social');
assert(cityInFeatured.score > cityInSocial.score, 'Destacados prioriza zona; Personas que quizá conozcas prioriza social');

// Motivo visible
const zone = { city: 'Medellín', region: 'Antioquia', country: 'Colombia' };
assert(reasonLabel('city', signals({}), zone) === 'En Medellín', 'motivo ciudad');
assert(reasonLabel('region', signals({}), zone) === 'En Antioquia', 'motivo departamento');
assert(
  reasonLabel('mutual', signals({ mutualNames: ['Ana', 'Luis', 'Sara'] }), zone) === 'Lo siguen Ana y 2 más',
  'motivo seguidos en común',
);
assert(reasonLabel('friendOfFriend', signals({ friendOfFriendNames: ['Carlos'] }), zone) === 'Amigo de Carlos', 'motivo amigo de amigo');

// Variedad estable
assert(stableJitter('s', 'u1') === stableJitter('s', 'u1'), 'jitter estable');
assert(stableJitter('s', 'u1') <= 5 && stableJitter('s', 'u1') >= 0, 'jitter acotado');

const ranked = [
  { id: 'c1', score: 50, kind: 'city' as const },
  { id: 'c2', score: 49, kind: 'city' as const },
  { id: 'c3', score: 48, kind: 'region' as const },
  { id: 'c4', score: 47, kind: 'country' as const },
  { id: 'm1', score: 30, kind: 'mutual' as const },
  { id: 'f1', score: 20, kind: 'friendOfFriend' as const },
];
const diverse = pickDiverse(ranked, 5);
assert(diverse.length === 5, 'devuelve el límite');
assert(diverse.some((item) => item.id === 'm1') && diverse.some((item) => item.id === 'f1'), 'mezcla motivos');
assert(diverse.filter((item) => ['city', 'region', 'country'].includes(item.kind)).length === 3, 'zona no acapara');
assert(pickDiverse(ranked, 2).map((item) => item.id).join(',') === 'c1,c2', 'tarjeta de 2: los mejores');

console.log('creatorRanking: ok');
