const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PRICE_VERSION,
  ANIMATED_30D_PROJECTION_REF,
  publicCatalog,
  quoteAmountCop,
  quoteAmountInCents,
  packageByDays,
  packageById,
  packageLabel,
  normalizeCatalog,
  animatedFromStatic,
} = require('./promoPackages');
const { projectRow, projectTable, DEFAULT_PARAMS } = require('./promoProjection');

describe('paquetes de banners', () => {
  it('congela los totales de la tabla y aplica el 25 % una sola vez', () => {
    const cat = publicCatalog();
    assert.equal(cat.version, PRICE_VERSION);
    assert.equal(packageByDays(1).staticCop, 24_900);
    assert.equal(packageByDays(1).animatedCop, 31_125);
    assert.equal(packageByDays(3).animatedCop, 74_875);
    assert.equal(packageByDays(7).animatedCop, 149_875);
    assert.equal(packageByDays(15).staticCop, 219_900);
    assert.equal(packageByDays(30).animatedCop, 499_875);
    assert.equal(animatedFromStatic(399_900), 499_875);
    assert.equal(ANIMATED_30D_PROJECTION_REF, 499_900);
    assert.notEqual(packageByDays(30).animatedCop, ANIMATED_30D_PROJECTION_REF);
  });

  it('no reconstruye el total con el diario redondeado', () => {
    const pkg = packageByDays(3);
    const roundedDaily = Math.round(pkg.staticCop / pkg.days);
    assert.notEqual(roundedDaily * pkg.days, pkg.staticCop);
    assert.equal(quoteAmountCop(pkg, 'static'), 59_900);
    assert.equal(quoteAmountInCents(packageByDays(30), 'animated'), 49_987_500);
  });

  it('ofrece el paquete de 2 horas sin cambiar los paquetes por días', () => {
    const h2 = packageById('2h');
    assert.equal(h2.days, 0);
    assert.equal(h2.hours, 2);
    assert.equal(h2.label, '2 horas');
    assert.equal(quoteAmountCop(h2, 'static'), 1_600);
    assert.equal(quoteAmountCop(h2, 'animated'), 2_000);
    assert.equal(quoteAmountInCents(h2, 'static'), 160_000);
    assert.equal(publicCatalog().packages[0].id, '2h');
    assert.equal(packageById('desconocido').id, '1d');
    assert.equal(packageByDays(0).id, '1d');
    assert.equal(packageByDays(undefined).id, '1d');
    assert.equal(packageByDays(1).hours, 24);
    assert.equal(packageLabel(3, 72), '3 días');
  });

  it('agrega el paquete de 2 horas a un catálogo guardado que no lo trae', () => {
    const cat = normalizeCatalog({
      version: 2,
      packages: [
        { id: '1d', days: 1, staticCop: 24_900 },
        { id: '3d', days: 3, staticCop: 59_900 },
      ],
    });
    assert.deepEqual(
      cat.packages.map((p) => p.id),
      ['2h', '1d', '3d'],
    );
    assert.equal(packageById('2h', cat).staticCop, 1_600);
    assert.equal(packageById('nope', cat).id, '1d');
    const custom = normalizeCatalog({
      packages: [
        { id: '2h', days: 0, hours: 2, staticCop: 1_800 },
        { id: '1d', days: 1, staticCop: 24_900 },
      ],
    });
    assert.equal(packageById('2h', custom).staticCop, 1_800);
    assert.equal(custom.packages.filter((p) => p.id === '2h').length, 1);
  });

  it('calcula el ahorro contra el día del mismo formato', () => {
    const d3 = packageByDays(3);
    assert.equal(Number(d3.savingsStaticPct.toFixed(1)), 19.8);
    const d30 = packageByDays(30);
    assert.equal(Number(d30.savingsStaticPct.toFixed(1)), 46.5);
  });
});

describe('proyección de ingresos (no es cobro)', () => {
  it('reproduce la captura con los supuestos iniciales', () => {
    const a = projectRow(100, DEFAULT_PARAMS);
    assert.equal(a.dauEstimated, 40);
    assert.equal(a.impressionsPerSlot, 2400);
    assert.equal(a.impressionsTotal, 7200);
    assert.equal(a.staticIncomeCopRounded, 19_603);
    assert.equal(a.animatedIncomeCopRounded, 24_504);

    const b = projectRow(5000, DEFAULT_PARAMS);
    assert.equal(b.impressionsTotal, 360_000);
    assert.equal(b.staticIncomeCopRounded, 980_151);
    assert.equal(b.animatedIncomeCopRounded, 1_225_189);
    assert.match(b.guidance, /CPM/);

    const c = projectRow(20_000, DEFAULT_PARAMS);
    assert.equal(c.impressionsTotal, 1_440_000);
    assert.equal(c.staticIncomeCopRounded, 3_920_603);
    assert.equal(c.animatedIncomeCopRounded, 4_900_754);
  });

  it('no suma estático y animado como si ambos se hubieran vendido', () => {
    const table = projectTable([100], DEFAULT_PARAMS);
    assert.match(table.disclaimer, /no se suman/);
    assert.equal(table.rows.length, 1);
  });
});
