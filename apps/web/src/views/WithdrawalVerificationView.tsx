import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, CheckCircle2, ChevronLeft, FileUp, Shield } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import {
  SLOT_LABELS,
  addVerificationAccount,
  fetchVerificationCase,
  fetchVerificationFileUrl,
  saveVerificationDraft,
  statusLabel,
  submitVerificationCase,
  uploadVerificationFile,
  type VerificationCase,
  type VerificationConfig,
} from '../lib/verificationApi';

const inputClass =
  'mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none';

function slotNeeded(config: VerificationConfig | null, docType: string, hasCert: boolean) {
  const doc = config?.documentTypes.find((item) => item.id === docType);
  const sides = doc?.sides || ['id_front', 'id_back'];
  return hasCert ? [...sides, 'bank_cert'] : sides;
}

export function WithdrawalVerificationView() {
  const profile = useAuthStore((state) => state.profile);
  const navigate = useNavigate();
  const [row, setRow] = useState<VerificationCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [legalName, setLegalName] = useState('');
  const [documentType, setDocumentType] = useState('CC');
  const [documentNumber, setDocumentNumber] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [documentExpiry, setDocumentExpiry] = useState('');
  const [bank, setBank] = useState('Nequi');
  const [accountType, setAccountType] = useState('billetera');
  const [accountNumber, setAccountNumber] = useState('');
  const [holderName, setHolderName] = useState('');
  const [accepted, setAccepted] = useState<string[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [addingAccount, setAddingAccount] = useState(false);

  const config = row?.config || null;
  const doc = config?.documentTypes.find((item) => item.id === documentType);
  const method = config?.payoutMethods.find((item) => item.id === bank);
  const slots = useMemo(
    () => slotNeeded(config, documentType, Boolean(method?.needsCertificate)),
    [config, documentType, method?.needsCertificate],
  );

  async function load() {
    setLoading(true);
    try {
      const next = await fetchVerificationCase();
      setRow(next);
      setLegalName(next.identity.legalName || '');
      setDocumentType(next.identity.documentType || 'CC');
      setDocumentNumber(next.identity.documentNumber || '');
      setBirthDate(next.identity.birthDate || '');
      setDocumentExpiry(next.identity.documentExpiry || '');
      const last = next.accounts[0];
      if (last) {
        setBank(last.bank);
        setAccountType(last.accountType);
        setHolderName(last.holderName);
      }
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'No se pudo cargar la verificación');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const reviewLocked = row?.status === 'submitted' || row?.status === 'in_review';
  const identityLocked = reviewLocked || row?.identityStatus === 'verified';
  const accountFormOpen = !reviewLocked && (row?.status !== 'verified' || addingAccount);

  async function persistDraft() {
    const next = await saveVerificationDraft({
      legalName,
      documentType,
      documentNumber,
      birthDate,
      documentExpiry,
      email: profile?.email || row?.identity.email,
    });
    setRow(next);
    return next;
  }

  async function onFile(slot: string, file: File | undefined) {
    if (!file || reviewLocked) return;
    setBusy(true);
    setNote(null);
    try {
      await persistDraft();
      const url = URL.createObjectURL(file);
      setPreviews((prev) => ({ ...prev, [slot]: url }));
      const next = await uploadVerificationFile(slot, file);
      setRow(next);
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'No se pudo subir el archivo');
    } finally {
      setBusy(false);
    }
  }

  async function onAddAccount() {
    setBusy(true);
    setNote(null);
    try {
      await persistDraft();
      const next = await addVerificationAccount({
        bank,
        accountType,
        accountNumber,
        holderName: holderName || legalName,
      });
      setRow(next);
      setAccountNumber('');
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'No se pudo guardar la cuenta');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    setBusy(true);
    setNote(null);
    try {
      const next = await submitVerificationCase({
        identity: {
          legalName,
          documentType,
          documentNumber,
          birthDate,
          documentExpiry,
        },
        consents: accepted,
      });
      setRow(next);
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'No se pudo enviar el expediente');
    } finally {
      setBusy(false);
    }
  }

  async function openFile(fileId: string) {
    try {
      const signed = await fetchVerificationFileUrl(fileId);
      if (signed.url) window.open(signed.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'No se pudo abrir el documento');
    }
  }

  if (loading) {
    return <p className="p-6 text-sm text-zinc-400">Cargando verificación…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-3 py-4 pb-[max(1.5rem,var(--lb-safe-bottom))] sm:px-4">
      <button
        type="button"
        onClick={() => navigate('/billetera')}
        className="inline-flex min-h-11 items-center gap-1 text-sm text-zinc-400 hover:text-white"
      >
        <ChevronLeft size={16} /> Volver a billetera
      </button>

      <header className="rounded-2xl border border-white/10 bg-[#14151c] p-4">
        <p className="inline-flex items-center gap-2 text-sm font-bold text-cyan-200">
          <Shield size={16} /> Verificación para retiros
        </p>
        <p className="mt-2 text-sm text-zinc-300">{row?.message}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <p className="rounded-xl bg-black/30 px-3 py-2 text-sm text-zinc-200">
            Identidad: <strong>{statusLabel(row?.identityStatus)}</strong>
          </p>
          <p className="rounded-xl bg-black/30 px-3 py-2 text-sm text-zinc-200">
            Cuenta bancaria: <strong>{statusLabel(row?.accountStatus)}</strong>
          </p>
        </div>
        {row?.correction?.general ? (
          <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            {row.correction.general}
          </p>
        ) : null}
      </header>

      {row?.status === 'submitted' || row?.status === 'in_review' ? (
        <p className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
          Recibimos tus documentos. Podrás consultar aquí el resultado o cualquier corrección necesaria.
        </p>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-[#14151c] p-4">
        <h2 className="text-sm font-bold text-white">Identidad legal</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Distinto del nombre público @{profile?.handle || 'usuario'}. El correo autenticado se reutiliza y no equivale a identidad verificada.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-zinc-400 sm:col-span-2">
            Nombre legal del beneficiario
            <input className={inputClass} value={legalName} disabled={identityLocked} onChange={(e) => setLegalName(e.target.value)} />
          </label>
          <label className="block text-xs font-semibold text-zinc-400">
            Tipo de documento
            <select className={inputClass} value={documentType} disabled={identityLocked} onChange={(e) => setDocumentType(e.target.value)}>
              {(config?.documentTypes || []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-zinc-400">
            Número de documento
            <input className={inputClass} value={documentNumber} disabled={identityLocked} onChange={(e) => setDocumentNumber(e.target.value)} />
          </label>
          <label className="block text-xs font-semibold text-zinc-400">
            Fecha de nacimiento
            <input type="date" className={inputClass} value={birthDate} disabled={identityLocked} onChange={(e) => setBirthDate(e.target.value)} />
          </label>
          {doc?.hasExpiry ? (
            <label className="block text-xs font-semibold text-zinc-400">
              Vencimiento del documento
              <input
                type="date"
                className={inputClass}
                value={documentExpiry}
                disabled={identityLocked}
                onChange={(e) => setDocumentExpiry(e.target.value)}
              />
            </label>
          ) : null}
          <p className="sm:col-span-2 text-xs text-zinc-500">País emisor: Colombia. Correo: {profile?.email || row?.identity.email || '—'}</p>
        </div>
        {!reviewLocked && !identityLocked ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void persistDraft().catch((error) =>
                setNote(error instanceof Error ? error.message : 'No se pudo guardar'),
              )
            }
            className="mt-3 min-h-11 rounded-full border border-white/15 px-4 text-sm text-zinc-200"
          >
            Guardar y continuar después
          </button>
        ) : null}
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#14151c] p-4">
        <h2 className="text-sm font-bold text-white">Documentos</h2>
        <p className="mt-1 text-xs text-zinc-500">
          No se exige cédula y pasaporte a la vez. Subir un archivo no te verifica.
        </p>
        <div className="mt-3 grid gap-3">
          {slots.map((slot) => {
            const file = row?.files.find((item) => item.slot === slot);
            const correction = row?.correction?.[slot] || file?.correctionMessage;
            return (
              <div key={slot} className="rounded-xl border border-white/10 p-3">
                <p className="text-sm font-semibold text-zinc-200">{SLOT_LABELS[slot] || slot}</p>
                {correction ? <p className="mt-1 text-xs text-amber-200">{correction}</p> : null}
                {file ? (
                  <button type="button" className="mt-2 text-xs text-cyan-300" onClick={() => void openFile(file.id)}>
                    Ver archivo cargado
                  </button>
                ) : null}
                {previews[slot] ? (
                  <img src={previews[slot]} alt="" className="mt-2 max-h-40 rounded-lg object-contain" />
                ) : null}
                {!reviewLocked ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-white/10 px-3 text-xs text-white">
                      <FileUp size={14} /> Cargar archivo
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="hidden"
                        onChange={(event) => void onFile(slot, event.target.files?.[0])}
                      />
                    </label>
                    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-white/10 px-3 text-xs text-white">
                      <Camera size={14} /> Tomar foto
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(event) => void onFile(slot, event.target.files?.[0])}
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#14151c] p-4">
        <h2 className="text-sm font-bold text-white">Cuenta de cobro</h2>
        <p className="mt-1 text-xs text-zinc-500">
          El titular debe ser tu nombre legal. No aceptamos cuentas de terceros. Nunca pedimos clave, PIN ni CVV.
        </p>
        {row?.accounts?.length ? (
          <ul className="mt-3 space-y-2">
            {row.accounts.map((account) => (
              <li key={account.id} className="rounded-xl bg-black/30 px-3 py-2 text-sm text-zinc-200">
                {account.bank} · {account.accountType} · {account.accountNumberMasked} · {account.holderName} ·{' '}
                {statusLabel(account.status)}
              </li>
            ))}
          </ul>
        ) : null}
        {row?.status === 'verified' && !addingAccount ? (
          <button
            type="button"
            className="mt-3 min-h-11 rounded-full border border-white/15 px-4 text-sm text-zinc-200"
            onClick={() => setAddingAccount(true)}
          >
            Verificar otra cuenta
          </button>
        ) : null}
        {accountFormOpen ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-zinc-400">
              Banco / medio
              <select className={inputClass} value={bank} onChange={(e) => setBank(e.target.value)}>
                {(config?.payoutMethods || []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-zinc-400">
              Tipo de cuenta
              <select className={inputClass} value={accountType} onChange={(e) => setAccountType(e.target.value)}>
                {(config?.accountTypes || []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-zinc-400 sm:col-span-2">
              Número de cuenta
              <input
                className={inputClass}
                value={accountNumber}
                autoComplete="off"
                onChange={(e) => setAccountNumber(e.target.value)}
              />
            </label>
            <label className="block text-xs font-semibold text-zinc-400 sm:col-span-2">
              Titular (nombre legal)
              <input className={inputClass} value={holderName} onChange={(e) => setHolderName(e.target.value)} />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onAddAccount()}
              className="min-h-11 rounded-full border border-cyan-400/40 px-4 text-sm text-cyan-100 sm:col-span-2"
            >
              Guardar cuenta
            </button>
          </div>
        ) : null}
      </section>

      {config?.extraDocuments?.length ? (
        <section className="rounded-2xl border border-white/10 bg-[#14151c] p-4">
          <h2 className="text-sm font-bold text-white">Documentos adicionales</h2>
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-[#14151c] p-4">
        <h2 className="text-sm font-bold text-white">Resumen y autorizaciones</h2>
        <p className="mt-2 text-sm text-zinc-300">
          {legalName || '—'} · {documentType} {documentNumber || '—'} · {row?.accounts[0]?.bank || bank}{' '}
          {row?.accounts[0]?.accountNumberMasked || ''}
        </p>
        <p className="mt-2 text-xs text-zinc-500">{config?.biometricNote}</p>
        <ul className="mt-3 space-y-3">
          {(config?.consents || []).map((item) => (
            <li key={item.key}>
              <label className="flex items-start gap-2 text-sm text-zinc-200">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={accepted.includes(item.key)}
                  disabled={reviewLocked && !addingAccount}
                  onChange={(event) => {
                    setAccepted((prev) =>
                      event.target.checked ? [...prev, item.key] : prev.filter((key) => key !== item.key),
                    );
                  }}
                />
                <span>
                  <strong>{item.title}</strong>
                  <span className="mt-1 block text-xs text-zinc-500">{item.body}</span>
                  <span className="mt-1 block text-[10px] text-zinc-600">Versión {item.version}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {note ? <p className="mt-3 text-sm text-fuchsia-400">{note}</p> : null}
        {row?.status === 'verified' && !addingAccount ? (
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-emerald-300">
            <CheckCircle2 size={16} /> Identidad y cuenta verificadas. Ya puedes solicitar un retiro.
          </p>
        ) : (
          <button
            type="button"
            disabled={busy || reviewLocked}
            onClick={() => void onSubmit()}
            className="mt-4 min-h-11 w-full rounded-full bg-emerald-500 px-6 text-sm font-bold text-zinc-950 disabled:opacity-50 sm:w-auto"
          >
            {busy ? 'Enviando…' : row?.action?.label === 'Corregir documentos' ? 'Enviar corrección' : 'Enviar a verificación'}
          </button>
        )}
        <p className="mt-3 text-xs text-zinc-500">
          Aprobar la identidad no transfiere dinero. <Link to="/billetera" className="text-cyan-300">Volver a la billetera</Link>
        </p>
      </section>
    </div>
  );
}
