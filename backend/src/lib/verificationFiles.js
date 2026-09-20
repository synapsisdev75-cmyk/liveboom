const { createHash, randomBytes } = require('crypto');

const MAGIC = [
  { mime: 'image/jpeg', test: (buf) => buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff },
  { mime: 'image/png', test: (buf) => buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 },
  {
    mime: 'image/webp',
    test: (buf) =>
      buf.length > 12 &&
      buf.slice(0, 4).toString('ascii') === 'RIFF' &&
      buf.slice(8, 12).toString('ascii') === 'WEBP',
  },
  { mime: 'application/pdf', test: (buf) => buf.length > 5 && buf.slice(0, 5).toString('ascii') === '%PDF-' },
];

function sniffMime(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  const hit = MAGIC.find((item) => item.test(buf));
  return hit ? hit.mime : '';
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function newFileId() {
  return `vf_${randomBytes(12).toString('hex')}`;
}

function storagePath(uid, caseId, fileId) {
  return `admin/private/verification/${uid}/${caseId}/${fileId}`;
}

module.exports = {
  sniffMime,
  sha256,
  newFileId,
  storagePath,
};
module.exports.default = module.exports;
