import { Job } from '../models/Job.js';
import type { JobRow } from '../../types.js';
import { pickUpdatableFields, buildFailedJobPatch, type JobUpdate } from './jobUtils.js';

export type { JobUpdate };

export const createJob = async ({ contentHash }: { contentHash: string }): Promise<JobRow> => {
  const job = await Job.create({
    content_hash: contentHash,
    status: 'QUEUED',
  });
  return job.get({ plain: true }) as JobRow;
};

export const getJob = async (id: string): Promise<JobRow | null> => {
  const job = await Job.findByPk(id);
  return job ? (job.get({ plain: true }) as JobRow) : null;
};

/**
 * Partial update. `fields` is filtered to updatable columns by jobUtils;
 * `updated_at` is always bumped by Sequelize's managed timestamps.
 */
export const updateJob = async (id: string, fields: JobUpdate): Promise<JobRow> => {
  const patch = pickUpdatableFields(fields);

  if (Object.keys(patch).length === 0) {
    const existing = await getJob(id);
    if (!existing) {
      throw new Error(`Job ${id} not found`);
    }
    return existing;
  }

  const [, rows] = await Job.update(patch, {
    where: { id },
    returning: true,
  });
  if (rows.length === 0) {
    throw new Error(`Job ${id} not found`);
  }
  return rows[0].get({ plain: true }) as JobRow;
};

export const failJob = (id: string, message: unknown): Promise<JobRow> =>
  updateJob(id, buildFailedJobPatch(message));

export default {
  createJob,
  getJob,
  updateJob,
  failJob,
};
