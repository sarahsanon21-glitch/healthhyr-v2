'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { JOB_FIELD_LABELS, type JobDetail } from '@healthhyr/shared';
import { ApiError } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/AuthProvider';
import { formatDate, joinWords } from '../../lib/format';
import { ButtonLabel, FormError, FormNotice } from '../auth/FormParts';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { Spinner } from '../ui/Spinner';
import { JobForm } from './JobForm';
import { JobStatusBadge } from './JobStatusBadge';

type Load = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string };
type Action = 'close' | 'reopen' | 'cancel' | 'delete';

const LOAD_ERROR = 'We could not load this job. Check your connection and try again.';

/** What an action's error means to the person, in fixed friendly words. */
function actionError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return 'Could not reach HealthHyr. Check your connection and try again.';
    // The API's own messages for these are written for people and never contain internals.
    if (['job_not_published', 'job_not_reopenable', 'not_waiting_for_payment', 'payment_succeeded', 'job_not_deletable', 'job_locked'].includes(error.code)) return error.message;
    if (error.status === 404) return 'This job could not be found. It may have been deleted.';
  }
  return 'Something went wrong. Please try again.';
}

/** One job: its status and what you can do about it, and the form to edit it. */
export function JobEditor({ id }: { id: string }) {
  const { api } = useAuth();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [notice, setNotice] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    setLoad({ status: 'loading' });
    api
      .getJob(id)
      .then((loaded) => {
        if (cancelled) return;
        setJob(loaded);
        setLoad({ status: 'ready' });
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        const missing = failure instanceof ApiError && failure.status === 404;
        setLoad({ status: 'error', message: missing ? 'This job could not be found. It may have been deleted.' : LOAD_ERROR });
      });
    return () => {
      cancelled = true;
    };
  }, [api, id, attempt]);

  async function run(action: Action, work: () => Promise<JobDetail | void>, success: (result: JobDetail | void) => string | undefined) {
    if (!api || busy) return;
    setBusy(action);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await work();
      if (result) setJob(result);
      setNotice(success(result));
    } catch (failure) {
      setError(actionError(failure));
    } finally {
      setBusy(null);
      setConfirmDelete(false);
    }
  }

  if (load.status === 'loading') {
    return (
      <div className="flex items-center gap-3 text-base text-muted">
        <Spinner label="Loading this job" />
        <span aria-hidden="true">Loading this job</span>
      </div>
    );
  }

  if (load.status === 'error' || !job) {
    return (
      <div className="flex max-w-modal-md flex-col items-start gap-4">
        <FormError>{load.status === 'error' ? load.message : LOAD_ERROR}</FormError>
        <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </Button>
      </div>
    );
  }

  const locked = job.status === 'pending_payment';
  const endsInFuture = job.expiresAt !== null && new Date(job.expiresAt).getTime() > Date.now();
  const missing = job.missingFields.map((name) => JOB_FIELD_LABELS[name] ?? name);
  const working = busy !== null;

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex max-w-modal-md flex-col gap-3" aria-labelledby="job-status-heading" as="section">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="job-status-heading" className="font-heading text-xl font-bold text-ink">
            Status
          </h2>
          <JobStatusBadge status={job.status} />
        </div>

        {job.status === 'draft' && (
          <p className="text-base text-ink">
            {missing.length > 0
              ? `Before this job can be published you still need ${joinWords(missing)}.`
              : 'This job has everything it needs. Payment and publishing are not available yet.'}
          </p>
        )}
        {locked && (
          <p className="text-base text-ink">Waiting for payment. The required fields are locked. Cancel checkout if you need to change them.</p>
        )}
        {job.status === 'published' && <p className="text-base text-ink">Live until {formatDate(job.expiresAt)}. You can keep editing it while it is live.</p>}
        {job.status === 'closed' && (
          <p className="text-base text-ink">
            {endsInFuture
              ? `Closed. You can reopen it with no new payment until ${formatDate(job.expiresAt)}.`
              : 'Closed after its end date. Reopening it makes a draft that needs a new payment.'}
          </p>
        )}
        {job.status === 'expired' && (
          <p className="text-base text-ink">Expired on {formatDate(job.expiresAt)}. Reopening it makes a draft that needs a new payment.</p>
        )}

        {error && <FormError>{error}</FormError>}
        {notice && <FormNotice>{notice}</FormNotice>}

        <div className="flex flex-wrap gap-3">
          {job.status === 'published' && (
            <Button
              variant="secondary"
              disabled={working}
              aria-busy={busy === 'close'}
              onClick={() => run('close', () => api!.closeJob(job.id), () => 'This job is closed.')}
            >
              <ButtonLabel busy={busy === 'close'} busyLabel="Closing">
                Close job
              </ButtonLabel>
            </Button>
          )}
          {(job.status === 'closed' || job.status === 'expired') && (
            <Button
              disabled={working}
              aria-busy={busy === 'reopen'}
              onClick={() =>
                run('reopen', () => api!.reopenJob(job.id), (result) =>
                  result && result.status === 'published'
                    ? `This job is live again until ${formatDate(result.expiresAt)}. No new payment was needed.`
                    : 'This job is a draft again. Publishing it needs a new payment.',
                )
              }
            >
              <ButtonLabel busy={busy === 'reopen'} busyLabel="Reopening">
                {job.status === 'closed' && endsInFuture ? 'Reopen job' : 'Reopen as a draft'}
              </ButtonLabel>
            </Button>
          )}
          {locked && (
            <Button
              variant="secondary"
              disabled={working}
              aria-busy={busy === 'cancel'}
              onClick={() => run('cancel', () => api!.cancelCheckout(job.id), () => 'Checkout cancelled. You can edit this job again.')}
            >
              <ButtonLabel busy={busy === 'cancel'} busyLabel="Cancelling">
                Cancel checkout
              </ButtonLabel>
            </Button>
          )}
          {job.status === 'draft' && (
            <Button variant="destructive" disabled={working} onClick={() => setConfirmDelete(true)}>
              Delete draft
            </Button>
          )}
        </div>
      </Card>

      <JobForm job={job} locked={locked} onSaved={(saved) => setJob(saved)} />

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this draft?"
        description="This cannot be undone."
        size="sm"
        initialFocusRef={cancelRef}
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button ref={cancelRef} variant="secondary" onClick={() => setConfirmDelete(false)} disabled={busy === 'delete'}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={busy === 'delete'}
              aria-busy={busy === 'delete'}
              onClick={() =>
                run(
                  'delete',
                  async () => {
                    await api!.deleteJob(job.id);
                    router.replace('/dashboard');
                  },
                  () => undefined,
                )
              }
            >
              <ButtonLabel busy={busy === 'delete'} busyLabel="Deleting">
                Delete draft
              </ButtonLabel>
            </Button>
          </div>
        }
      >
        <p className="text-base text-ink">&ldquo;{job.title}&rdquo; will be removed.</p>
      </Modal>
    </div>
  );
}
