'use client';

import { useRouter } from 'next/navigation';
import { JobForm } from './JobForm';

/** The "Post a job" page: create a draft, then go to it. */
export function NewJob() {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-modal-md text-base text-muted">
        Save a draft now and finish it later. A draft is private: nobody sees it until it is published.
      </p>
      <JobForm onSaved={(job) => router.push(`/dashboard/jobs/${job.id}`)} />
    </div>
  );
}
