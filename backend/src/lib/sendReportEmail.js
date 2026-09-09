const crypto = require('crypto');

const REPORT_TO = 'josemanuelperessosa0@gmail.com';
const SUBJECT = '[LiveBoom] Nuevo reporte de usuario';

function formatBody(payload) {
  const reported = payload.reported || {};
  const reporter = payload.reporter || {};
  const lines = [
    'Usuario reportado:',
    `- nombre: ${reported.displayName || '—'}`,
    `- @username: @${reported.username || '—'}`,
    `- userId interno: ${reported.uid || '—'}`,
    '',
    'Usuario que reporta:',
    `- nombre: ${reporter.displayName || '—'}`,
    `- @username: @${reporter.username || '—'}`,
    `- userId interno: ${reporter.uid || '—'}`,
    '',
    `Fecha/hora: ${payload.timestamp || new Date().toISOString()}`,
    '',
    'Contexto:',
    '- Chat / Mensajes',
    payload.conversationId ? `- conversationId: ${payload.conversationId}` : '- conversationId: (no disponible)',
    '',
    'Motivo escrito:',
    payload.reason || '—',
  ];
  return lines.join('\n');
}

function smtpConfigured() {
  const host = String(process.env.SMTP_HOST || (process.env.GMAIL_USER ? 'smtp.gmail.com' : '')).trim();
  const user = String(process.env.SMTP_USER || process.env.GMAIL_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').trim();
  return { host, user, pass, ok: Boolean(host && user && pass) };
}

async function sendWithResend(text) {
  const key = String(process.env.RESEND_API_KEY || '').trim();
  if (!key) return null;
  const from = String(process.env.MAIL_FROM || 'LiveBoom <reports@liveboomapp.com>').trim();
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [REPORT_TO],
      subject: SUBJECT,
      text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`resend ${res.status}: ${body.slice(0, 300)}`);
  }
  return 'resend';
}

async function sendWithSmtp(text) {
  const { host, user, pass, ok } = smtpConfigured();
  if (!ok) return null;
  const nodemailer = require('nodemailer');
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || (port === 465 ? 'true' : 'false')) !== 'false';
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  await transporter.sendMail({
    from: process.env.MAIL_FROM || user,
    to: REPORT_TO,
    subject: SUBJECT,
    text,
    messageId: `<report-${crypto.randomUUID()}@liveboomapp.com>`,
  });
  return 'smtp';
}

async function sendReportEmail(payload) {
  const text = formatBody(payload);
  const resend = await sendWithResend(text);
  if (resend) return { provider: resend };
  const smtp = await sendWithSmtp(text);
  if (smtp) return { provider: smtp };
  const err = new Error('email_not_configured');
  err.code = 'email_not_configured';
  throw err;
}

module.exports = {
  REPORT_TO,
  sendReportEmail,
  formatBody,
};
