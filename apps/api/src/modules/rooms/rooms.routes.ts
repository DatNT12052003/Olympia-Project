import {
  assignSeatRequestSchema,
  changeRoleRequestSchema,
  createRoomRequestSchema,
  type JoinRoomResponse,
  joinRoomRequestSchema,
  readyRequestSchema,
  roomCodeSchema,
  roomStatusSchema,
  SystemPermission,
  updateRoomRequestSchema,
} from '@olympia/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { LimiterFactory } from '../../infrastructure/rate-limit/rate-limiter';
import {
  requireAuthenticated,
  requireCsrfHeader,
  requirePermission,
  requestPrincipal,
  requireUser,
  userPrincipal,
} from '../../shared/auth/http-auth';
import { TooManyRequestsError } from '../../shared/errors/app-error';
import { type AuthCookieConfig, writeGuestSession } from '../auth/auth.controller';
import type { LobbyService } from './lobby.service';
import type { RoomsService } from './rooms.service';

const roomParams = z.object({ roomId: z.uuid() });
const participantParams = roomParams.extend({ participantId: z.uuid() });
const listQuery = z.object({ status: roomStatusSchema.optional() });
const lookupQuery = z.object({ code: roomCodeSchema });

export interface RoomsRouterDeps {
  roomsService: RoomsService;
  lobbyService: LobbyService;
  limiters: LimiterFactory;
  cookies: AuthCookieConfig;
}

/**
 * `/api/rooms`. Thao tác sảnh chờ là REST; trạng thái phòng được đẩy qua Socket.IO (DL-026).
 * Quyền: Host chỉ thao tác trên phòng của mình (service kiểm tra, phòng người khác trả 404/403).
 */
export function createRoomsRouter({
  roomsService,
  lobbyService,
  limiters,
  cookies,
}: RoomsRouterDeps): Router {
  const router = Router();
  // Chống dò mã phòng (mã 6 ký tự).
  const lookupLimiter = limiters({ keyPrefix: 'room-lookup', points: 30, durationSeconds: 60 });
  // Chống lấp phòng bằng khách ảo / spam yêu cầu làm người chơi từ một địa chỉ.
  const joinLimiter = limiters({ keyPrefix: 'room-join', points: 15, durationSeconds: 60 });
  const canCreate = requirePermission(SystemPermission.CreateRooms);

  // --- Công khai ---
  router.get('/public', async (_req, res) => {
    res.json({ items: await roomsService.listPublic() });
  });

  router.get('/lookup', async (req, res) => {
    const blocked = await lookupLimiter.consume(req.ip ?? 'unknown');
    if (blocked !== null) throw new TooManyRequestsError(blocked);
    const { code } = lookupQuery.parse(req.query);
    res.json({ room: await roomsService.lookup(code) });
  });

  // --- Host ---
  router.get('/', requireUser, async (req, res) => {
    const { status } = listQuery.parse(req.query);
    res.json(await roomsService.listMine(userPrincipal(req), status));
  });

  router.post('/', canCreate, async (req, res) => {
    const input = createRoomRequestSchema.parse(req.body);
    res.status(201).json({ room: await roomsService.create(userPrincipal(req), input) });
  });

  router.get('/:roomId', requireUser, async (req, res) => {
    const { roomId } = roomParams.parse(req.params);
    res.json({ room: await roomsService.get(userPrincipal(req), roomId) });
  });

  router.patch('/:roomId', requireUser, async (req, res) => {
    const { roomId } = roomParams.parse(req.params);
    const input = updateRoomRequestSchema.parse(req.body);
    res.json({ room: await roomsService.update(userPrincipal(req), roomId, input) });
  });

  router.delete('/:roomId', requireUser, async (req, res) => {
    const { roomId } = roomParams.parse(req.params);
    await roomsService.remove(userPrincipal(req), roomId);
    res.status(204).end();
  });

  router.post('/:roomId/open', canCreate, async (req, res) => {
    const { roomId } = roomParams.parse(req.params);
    res.json({ room: await roomsService.open(userPrincipal(req), roomId) });
  });

  router.post('/:roomId/close', requireUser, async (req, res) => {
    const { roomId } = roomParams.parse(req.params);
    res.json({ room: await roomsService.close(userPrincipal(req), roomId) });
  });

  router.post('/:roomId/code', requireUser, async (req, res) => {
    const { roomId } = roomParams.parse(req.params);
    res.json({ room: await roomsService.regenerateCode(userPrincipal(req), roomId) });
  });

  // --- Người tham gia ---

  /** Tài khoản hoặc khách (không cần đăng nhập). Khách mới nhận phiên khách gắn phòng. */
  router.post('/:roomId/join', requireCsrfHeader, async (req, res) => {
    const { roomId } = roomParams.parse(req.params);
    const blocked = await joinLimiter.consume(`${req.ip ?? 'unknown'}|${roomId}`);
    if (blocked !== null) throw new TooManyRequestsError(blocked, 'Bạn vào phòng quá nhiều lần.');
    const input = joinRoomRequestSchema.parse(req.body);
    const result = await lobbyService.join(req.principal, roomId, input, { ip: req.ip });
    const body: JoinRoomResponse = {
      participant: result.participant,
      ...(result.guestSession
        ? { guestSession: writeGuestSession(res, result.guestSession, cookies) }
        : {}),
    };
    res.status(201).json(body);
  });

  router.get('/:roomId/me', requireAuthenticated, async (req, res) => {
    const { roomId } = roomParams.parse(req.params);
    res.json({ participant: await lobbyService.me(requestPrincipal(req), roomId) });
  });

  router.post('/:roomId/me/ready', requireAuthenticated, async (req, res) => {
    const { roomId } = roomParams.parse(req.params);
    const { ready } = readyRequestSchema.parse(req.body);
    await lobbyService.setReady(requestPrincipal(req), roomId, ready);
    res.status(204).end();
  });

  router.delete('/:roomId/me', requireAuthenticated, async (req, res) => {
    const { roomId } = roomParams.parse(req.params);
    await lobbyService.leave(requestPrincipal(req), roomId);
    res.status(204).end();
  });

  // --- Host quản lý sảnh chờ (BR-JOIN-03) ---
  router.post('/:roomId/participants/:participantId/approve', requireUser, async (req, res) => {
    const { roomId, participantId } = participantParams.parse(req.params);
    await lobbyService.approve(requestPrincipal(req), roomId, participantId);
    res.status(204).end();
  });

  router.post('/:roomId/participants/:participantId/reject', requireUser, async (req, res) => {
    const { roomId, participantId } = participantParams.parse(req.params);
    await lobbyService.reject(requestPrincipal(req), roomId, participantId);
    res.status(204).end();
  });

  router.put('/:roomId/participants/:participantId/seat', requireUser, async (req, res) => {
    const { roomId, participantId } = participantParams.parse(req.params);
    const { seat } = assignSeatRequestSchema.parse(req.body);
    await lobbyService.assignSeat(requestPrincipal(req), roomId, participantId, seat);
    res.status(204).end();
  });

  router.put('/:roomId/participants/:participantId/role', requireUser, async (req, res) => {
    const { roomId, participantId } = participantParams.parse(req.params);
    const { role } = changeRoleRequestSchema.parse(req.body);
    await lobbyService.changeRole(requestPrincipal(req), roomId, participantId, role);
    res.status(204).end();
  });

  router.post('/:roomId/participants/:participantId/kick', requireUser, async (req, res) => {
    const { roomId, participantId } = participantParams.parse(req.params);
    await lobbyService.kick(requestPrincipal(req), roomId, participantId);
    res.status(204).end();
  });

  router.post('/:roomId/participants/:participantId/ban', requireUser, async (req, res) => {
    const { roomId, participantId } = participantParams.parse(req.params);
    await lobbyService.ban(requestPrincipal(req), roomId, participantId);
    res.status(204).end();
  });

  return router;
}
