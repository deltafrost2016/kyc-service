import { Router, type Request, type Response, type NextFunction } from 'express';
import { getJob } from '../../database/repositories/jobRepository';

const router = Router();

/** GET /jobs/:id — returns the job row (status + any completed stages). */
router.get('/jobs/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    return res.json(job);
  } catch (err) {
    return next(err);
  }
});

export default router;
