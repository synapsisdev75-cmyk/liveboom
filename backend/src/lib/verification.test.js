const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { namesCompatible, ageFromBirthDate } = require('./verificationNormalize');
const files = require('./verificationFiles');
const verification = require('./verificationService');
const confirm = require('./verificationConfirm');

describe('verificación de retiros', () => {
  it('tildes y orden de apellidos no son fraude automático', () => {
    assert.equal(namesCompatible('Ana María Pérez', 'Ana Maria Perez').ok, true);
    assert.equal(namesCompatible('Pérez Gómez Ana', 'Ana Pérez Gómez').ok, true);
    assert.equal(namesCompatible('Ana Pérez', 'Luis Gómez').ok, false);
  });

  it('edad mínima 18 y sin vencimiento inventado', () => {
    const now = Date.parse('2026-09-19T00:00:00.000Z');
    assert.equal(ageFromBirthDate('2008-09-19', now), 18);
    assert.equal(ageFromBirthDate('2008-09-20', now), 17);
    assert.equal(ageFromBirthDate('', now), null);
  });

  it('sniff de archivos reales, no el MIME declarado', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const fake = Buffer.from('not-an-image');
    assert.equal(files.sniffMime(jpeg), 'image/jpeg');
    assert.equal(files.sniffMime(fake), '');
    assert.match(files.storagePath('u1', 'wv_u1', 'vf_x'), /^admin\/private\/verification\//);
  });

  it('subir archivos no verifica y el solicitante no puede aprobarse', async () => {
    const uid = `u_${Date.now()}`;
    const pub = await verification.saveDraft(
      uid,
      {
        legalName: 'Ana Pérez',
        documentType: 'CC',
        documentNumber: '1234567890',
        birthDate: '1990-01-01',
      },
      { email: 'ana@test.com' },
    );
    assert.equal(pub.identityStatus, 'unverified');
    assert.equal(pub.canWithdraw, false);
    await assert.rejects(
      () =>
        verification.decideCase({
          uid,
          actorId: uid,
          actorEmail: 'ana@test.com',
          action: 'approve',
        }),
      /propio expediente/,
    );
  });

  it('el código de retiro es de un solo uso y se invalida si cambia el importe', async () => {
    const issued = await confirm.issueConfirm({
      userId: 'u1',
      coins: 21000,
      accountId: 'ac1',
      fingerprint: 'fp-a',
    });
    const first = await confirm.consumeConfirm({
      confirmId: issued.confirmId,
      code: issued.code,
      userId: 'u1',
      coins: 21000,
      accountId: 'ac1',
      fingerprint: 'fp-a',
    });
    assert.equal(first.ok, true);
    const reuse = await confirm.consumeConfirm({
      confirmId: issued.confirmId,
      code: issued.code,
      userId: 'u1',
      coins: 21000,
      accountId: 'ac1',
      fingerprint: 'fp-a',
    });
    assert.equal(reuse.ok, false);
    assert.equal(reuse.code, 'CONFIRM_USED');

    const other = await confirm.issueConfirm({
      userId: 'u1',
      coins: 21000,
      accountId: 'ac1',
      fingerprint: 'fp-a',
    });
    const stale = await confirm.consumeConfirm({
      confirmId: other.confirmId,
      code: other.code,
      userId: 'u1',
      coins: 22000,
      accountId: 'ac1',
      fingerprint: 'fp-a',
    });
    assert.equal(stale.ok, false);
    assert.equal(stale.code, 'CONFIRM_STALE');
  });

  it('sin expediente verificado no hay retiro', async () => {
    const result = await verification.requireVerifiedPayout('nobody', {
      fullName: 'Ana',
      documentId: '1',
      payoutMethod: 'Nequi',
      accountNumber: '3001234567',
      accountType: 'billetera',
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'IDENTITY_UNVERIFIED');
  });

  it('aprobar identidad no transfiere y la cuenta nueva exige verificación', async () => {
    const uid = `u_ok_${Date.now()}`;
    const reviewer = `admin_${Date.now()}`;
    await verification.saveDraft(
      uid,
      {
        legalName: 'Ana Pérez Gómez',
        documentType: 'CC',
        documentNumber: '1234567890',
        birthDate: '1990-01-01',
      },
      { email: 'ana@test.com' },
    );
    await verification.upsertAccount(uid, {
      bank: 'Nequi',
      accountType: 'billetera',
      accountNumber: '3001234567',
      holderName: 'Ana Perez Gomez',
    });
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01].concat(Array(40).fill(1)));
    await verification.saveFile({ uid, slot: 'id_front', buffer: jpeg, declaredType: 'image/jpeg' });
    await verification.saveFile({ uid, slot: 'id_back', buffer: jpeg, declaredType: 'image/jpeg' });
    await verification.submitCase(
      uid,
      {
        identity: {
          legalName: 'Ana Pérez Gómez',
          documentType: 'CC',
          documentNumber: '1234567890',
          birthDate: '1990-01-01',
        },
        consents: ['identity_processing', 'account_ownership', 'admin_review'],
      },
      { email: 'ana@test.com' },
    );
    const approved = await verification.decideCase({
      uid,
      actorId: reviewer,
      actorEmail: 'admin@liveboomapp.com',
      action: 'approve',
      internalNote: 'Documentos coherentes',
    });
    assert.equal(approved.status, 'verified');
    assert.equal(approved.canWithdraw, true);
    const byAccount = await verification.requireVerifiedPayout(uid, {
      accountId: approved.accounts[0].id,
    });
    assert.equal(byAccount.ok, true);
    await verification.upsertAccount(uid, {
      bank: 'Bancolombia',
      accountType: 'ahorros',
      accountNumber: '01234567890',
      holderName: 'Empresa SAS',
    });
    const third = await verification.requireVerifiedPayout(uid, {
      payoutMethod: 'Bancolombia',
      accountType: 'ahorros',
      accountNumber: '01234567890',
      fullName: 'Ana Pérez Gómez',
      documentId: '1234567890',
    });
    assert.equal(third.ok, false);
  });
});
