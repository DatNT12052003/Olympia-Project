import {
  appendSetItemsRequestSchema,
  publicSetListQuerySchema,
  questionIdsRequestSchema,
  questionInputSchema,
  questionListQuerySchema,
  questionSetInputSchema,
  randomFillRequestSchema,
  rejectVersionRequestSchema,
  replaceSetItemsRequestSchema,
  SystemPermission,
} from '@olympia/shared';
import { Router } from 'express';
import { z } from 'zod';
import { requirePermission, userPrincipal } from '../../shared/auth/http-auth';
import type { PublicSetsService } from './public-sets.service';
import type { QuestionSetsService } from './question-sets.service';
import type { QuestionsService } from './questions.service';

const idParams = z.object({ id: z.uuid() });
const versionParams = z.object({ versionId: z.uuid() });

/** `/api/questions`: ngân hàng câu hỏi của Host (5.1, 5.2). */
export function createQuestionsRouter(questions: QuestionsService): Router {
  const router = Router();
  router.use(requirePermission(SystemPermission.ManageOwnQuestions));

  router.get('/', async (req, res) => {
    res.json(await questions.list(userPrincipal(req), questionListQuerySchema.parse(req.query)));
  });

  router.get('/facets', async (req, res) => {
    res.json(await questions.facets(userPrincipal(req)));
  });

  router.post('/', async (req, res) => {
    const input = questionInputSchema.parse(req.body);
    res.status(201).json({ question: await questions.create(userPrincipal(req), input) });
  });

  /** Ẩn nhiều câu hỏi (xóa mềm, BR-QB-03). */
  router.post('/delete', async (req, res) => {
    const { ids } = questionIdsRequestSchema.parse(req.body);
    res.json({ deleted: await questions.softDelete(userPrincipal(req), ids) });
  });

  router.get('/:id', async (req, res) => {
    const { id } = idParams.parse(req.params);
    res.json({ question: await questions.get(userPrincipal(req), id) });
  });

  router.put('/:id', async (req, res) => {
    const { id } = idParams.parse(req.params);
    const input = questionInputSchema.parse(req.body);
    res.json({ question: await questions.update(userPrincipal(req), id, input) });
  });

  return router;
}

/** `/api/question-sets`: bộ đề của Host (5.3) và gửi chia sẻ public (5.4). */
export function createQuestionSetsRouter(sets: QuestionSetsService): Router {
  const router = Router();
  router.use(requirePermission(SystemPermission.ManageOwnQuestions));

  router.get('/', async (req, res) => {
    res.json({ items: await sets.list(userPrincipal(req)) });
  });

  router.post('/', async (req, res) => {
    const input = questionSetInputSchema.parse(req.body);
    res.status(201).json({ set: await sets.create(userPrincipal(req), input) });
  });

  router.get('/:id', async (req, res) => {
    const { id } = idParams.parse(req.params);
    res.json({ set: await sets.detail(userPrincipal(req), id) });
  });

  router.put('/:id', async (req, res) => {
    const { id } = idParams.parse(req.params);
    const input = questionSetInputSchema.parse(req.body);
    res.json({ set: await sets.update(userPrincipal(req), id, input) });
  });

  router.delete('/:id', async (req, res) => {
    const { id } = idParams.parse(req.params);
    await sets.remove(userPrincipal(req), id);
    res.status(204).end();
  });

  router.put('/:id/items', async (req, res) => {
    const { id } = idParams.parse(req.params);
    const input = replaceSetItemsRequestSchema.parse(req.body);
    res.json({ set: await sets.replaceItems(userPrincipal(req), id, input) });
  });

  router.post('/:id/items', async (req, res) => {
    const { id } = idParams.parse(req.params);
    const input = appendSetItemsRequestSchema.parse(req.body);
    res.json(await sets.appendItems(userPrincipal(req), id, input));
  });

  router.post('/:id/random', async (req, res) => {
    const { id } = idParams.parse(req.params);
    const input = randomFillRequestSchema.parse(req.body);
    res.json(await sets.randomFill(userPrincipal(req), id, input));
  });

  router.post('/:id/publish', async (req, res) => {
    const { id } = idParams.parse(req.params);
    res.json({ set: await sets.publish(userPrincipal(req), id) });
  });

  router.post('/:id/unpublish', async (req, res) => {
    const { id } = idParams.parse(req.params);
    res.json({ set: await sets.unpublish(userPrincipal(req), id) });
  });

  return router;
}

/** `/api/public-question-sets`: danh mục bộ public đã duyệt và sao chép (5.4). */
export function createPublicSetsRouter(publicSets: PublicSetsService): Router {
  const router = Router();
  router.use(requirePermission(SystemPermission.UsePublicQuestionSets));

  router.get('/', async (req, res) => {
    const query = publicSetListQuerySchema.parse(req.query);
    res.json({ items: await publicSets.list(userPrincipal(req), query) });
  });

  router.get('/:versionId', async (req, res) => {
    const { versionId } = versionParams.parse(req.params);
    res.json({ set: await publicSets.get(userPrincipal(req), versionId) });
  });

  router.post(
    '/:versionId/copy',
    requirePermission(SystemPermission.ManageOwnQuestions),
    async (req, res) => {
      const { versionId } = versionParams.parse(req.params);
      res.status(201).json(await publicSets.copy(userPrincipal(req), versionId));
    },
  );

  return router;
}

/** `/api/moderation/question-sets`: kiểm duyệt bộ public (Manager/Super Admin, BR-QB-10). */
export function createModerationRouter(publicSets: PublicSetsService): Router {
  const router = Router();
  router.use(requirePermission(SystemPermission.ModerateQuestionSets));

  router.get('/', async (_req, res) => {
    res.json({ items: await publicSets.queue() });
  });

  router.get('/:versionId', async (req, res) => {
    const { versionId } = versionParams.parse(req.params);
    res.json({ version: await publicSets.reviewDetail(versionId) });
  });

  router.post('/:versionId/approve', async (req, res) => {
    const { versionId } = versionParams.parse(req.params);
    await publicSets.approve(userPrincipal(req), versionId);
    res.status(204).end();
  });

  router.post('/:versionId/reject', async (req, res) => {
    const { versionId } = versionParams.parse(req.params);
    const { reason } = rejectVersionRequestSchema.parse(req.body);
    await publicSets.reject(userPrincipal(req), versionId, reason);
    res.status(204).end();
  });

  return router;
}
