'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CARE_ROLE_LABELS, EMPLOYMENT_TYPE_LABELS, type CompanyProfileResponse, type JobSummary } from '@healthhyr/shared';
import { useAuth } from '../../lib/auth/AuthProvider';
import { formatDate } from '../../lib/format';
import { FormError } from '../auth/FormParts';
import { Button, buttonClasses } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Spinner } from '../ui/Spinner';
import { JobStatusBadge } from './JobStatusBadge';

type Load =
  | { status: 'loading' }
  | { status: 'ready'; jobs: JobSummary[]; company: CompanyProfileResponse | null }
  | { status: 'error' };

const LOAD_ERROR = 'We could not load your jobs. Check your connection and try again.';

/** The employer's home: post a job, edit the company profile, and every job with its status. */
export function EmployerDashboard() {
  const { api } = useAuth();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    setLoad({ status: 'loading' });
    // The company is only used for a hint, so failing to load it does not hide the jobs.
    Promise.all([api.listJobs(), api.getMyCompany().catch(() => null)])
      .then(([jobs, company]) => {
        if (!cancelled) setLoad({ status: 'ready', jobs, company });
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [api, attempt]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard/jobs/new" className={buttonClasses({ variant: 'primary' })}>
          Post a job
        </Link>
        <Link href="/company" className={buttonClasses({ variant: 'secondary' })}>
          Edit company profile
        </Link>
      </div>

      {load.status === 'loading' && (
        <div className="flex items-center gap-3 text-base text-muted">
          <Spinner label="Loading your jobs" />
          <span aria-hidden="true">Loading your jobs</span>
        </div>
      )}

      {load.status === 'error' && (
        <div className="flex max-w-modal-md flex-col items-start gap-4">
          <FormError>{LOAD_ERROR}</FormError>
          <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </div>
      )}

      {load.status === 'ready' && (
        <>
          {load.company && !load.company.isListed && (
            <Card className="max-w-modal-md">
              <p className="text-base text-ink">
                Your company page is hidden, and you need a company name before you can pay for a post.{' '}
                <Link href="/company" className="font-semibold text-primary underline">
                  Set your company name
                </Link>
              </p>
            </Card>
          )}

          {load.jobs.length === 0 ? (
            <EmptyState
              title="You have not posted any jobs yet"
              description="Start a draft. You can save it unfinished and come back to it."
              action={
                <Link href="/dashboard/jobs/new" className={buttonClasses({ variant: 'primary' })}>
                  Post a job
                </Link>
              }
            />
          ) : (
            <section aria-labelledby="jobs-heading" className="flex flex-col gap-3">
              <h2 id="jobs-heading" className="font-heading text-xl font-bold text-ink">
                Your jobs
              </h2>
              <ul className="flex flex-col gap-3">
                {load.jobs.map((job) => (
                  <Card as="li" key={job.id} className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-heading text-lg font-bold text-ink">
                        <Link href={`/dashboard/jobs/${job.id}`} className="underline">
                          {job.title}
                        </Link>
                      </h3>
                      <JobStatusBadge status={job.status} />
                    </div>
                    <p className="text-base text-muted">
                      {CARE_ROLE_LABELS[job.careRole]} · {EMPLOYMENT_TYPE_LABELS[job.employmentType]} · {job.city}, {job.state}
                    </p>
                    <p className="text-sm text-muted">
                      {job.status === 'published' && job.expiresAt ? `Live until ${formatDate(job.expiresAt)}. ` : ''}
                      Updated {formatDate(job.updatedAt)}
                    </p>
                  </Card>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
