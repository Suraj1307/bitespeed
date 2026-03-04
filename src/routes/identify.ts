import { Router } from 'express';
import { identify } from '../controllers/identifyController';

const router = Router();

// POST /identify
router.post('/', identify);

export default router;
