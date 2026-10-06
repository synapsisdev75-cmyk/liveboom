const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLocationQuery, locationQueryString, previewText, renderLocationOgHtml } = require('./locationPreview');

test('el enlace de ubicación se lee y se rechazan coordenadas inválidas', () => {
  const loc = parseLocationQuery({ lat: '4.08509', lng: '-73.65922', n: 'Villavicencio', live: 'ox5CDMfEsfUZ3yjqX49C', u: 'bTx4id5ZymMykmZIA9HyCM8ciVK2', h: 'yemdups' });
  assert.equal(loc.lat, 4.08509);
  assert.equal(loc.liveId, 'ox5CDMfEsfUZ3yjqX49C');
  assert.equal(loc.handle, 'yemdups');
  assert.match(locationQueryString(loc), /live=ox5CDMfEsfUZ3yjqX49C/);
  assert.equal(parseLocationQuery({ lat: '0', lng: '0' }), null);
  assert.equal(parseLocationQuery({ lat: 'abc', lng: '2' }), null);
  assert.equal(parseLocationQuery({ lat: '4', lng: '-73', live: 'x<script>' }).liveId, undefined);
});

test('la vista previa trae imagen del mapa y texto según el estado', () => {
  const live = previewText({ live: true, ended: false, handle: 'yemdups', label: '' });
  assert.match(live.title, /@yemdups comparte su ubicación en tiempo real/);
  const ended = previewText({ live: false, ended: true, handle: 'yemdups' });
  assert.match(ended.title, /terminada/);
  const html = renderLocationOgHtml({
    ctx: { live: false, ended: false, label: 'Villavicencio <b>', handle: '' },
    pageUrl: 'https://liveboomapp.com/l?lat=4&lng=-73',
    imageUrl: 'https://liveboomapp.com/l/map.jpg?lat=4&lng=-73',
    webUrl: 'https://liveboomapp.com/ubicacion?lat=4&lng=-73',
  });
  assert.match(html, /og:image" content="https:\/\/liveboomapp\.com\/l\/map\.jpg\?lat=4&amp;lng=-73"/);
  assert.match(html, /og:image:width" content="1200"/);
  assert.doesNotMatch(html, /<b>/);
});
