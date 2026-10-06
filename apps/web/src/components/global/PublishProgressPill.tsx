import { CheckCircle2, Loader2, X, XCircle } from 'lucide-react';
import {
  cancelPublishJob,
  dismissPublishJob,
  publishStageLabel,
  usePublishProgressStore,
} from '../../lib/publishProgress';
import './publishProgress.css';

/**
 * Progreso de publicaciones que siguen subiendo con el compositor cerrado:
 * el usuario puede seguir usando la app (Publicaciones, Boom Clip, Flash Boom).
 */
export function PublishProgressPill() {
  const allJobs = usePublishProgressStore((state) => state.jobs);
  const jobs = allJobs.filter((job) => job.detached);
  if (jobs.length === 0) return null;
  return (
    <div className="lb-publish-progress" role="status" aria-live="polite">
      {jobs.map((job) => {
        const active = job.stage === 'preparing' || job.stage === 'uploading' || job.stage === 'processing';
        return (
          <div key={job.id} className={`lb-publish-progress__item is-${job.stage}`}>
            <span className="lb-publish-progress__icon" aria-hidden>
              {active ? (
                <Loader2 size={16} className="animate-spin" />
              ) : job.stage === 'done' ? (
                <CheckCircle2 size={16} />
              ) : (
                <XCircle size={16} />
              )}
            </span>
            <span className="lb-publish-progress__text">
              <span className="lb-publish-progress__label">{job.label}</span>
              <span className="lb-publish-progress__stage">{job.message || publishStageLabel(job)}</span>
              {job.stage === 'uploading' ? (
                <span className="lb-publish-progress__bar" aria-hidden>
                  <span style={{ width: `${job.pct ?? 0}%` }} />
                </span>
              ) : null}
            </span>
            <button
              type="button"
              className="lb-publish-progress__close"
              onClick={() => (active ? cancelPublishJob(job.id) : dismissPublishJob(job.id))}
              aria-label={active ? 'Cancelar subida' : 'Cerrar'}
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
