import { JOB_STATUS_LABELS, type JobStatus } from '@healthhyr/shared';
import { Badge, type BadgeVariant } from '../ui/Badge';

// The words carry the meaning; the color only supports them.
const VARIANTS: Record<JobStatus, BadgeVariant> = {
  draft: 'neutral',
  pending_payment: 'primary',
  published: 'lime',
  closed: 'neutral',
  expired: 'neutral',
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge variant={VARIANTS[status]}>{JOB_STATUS_LABELS[status]}</Badge>;
}
