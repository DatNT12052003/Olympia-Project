import { RoomErrorCode, type RoomRemovedReason } from '@olympia/shared';
import { Link, useParams } from 'react-router';
import { HostMatch } from '../../features/match/HostMatch';
import { MatchResultDialog } from '../../features/match/match-ui';
import { PlayerMatch } from '../../features/match/PlayerMatch';
import { SpectatorMatch } from '../../features/match/SpectatorMatch';
import { HostLobby } from '../../features/rooms/HostLobby';
import { MemberLobby } from '../../features/rooms/MemberLobby';
import {
  ReactionLayer,
  ReconnectOverlay,
  StageMessage,
  StagePage,
} from '../../features/rooms/room-stage';
import { useMyParticipation } from '../../features/rooms/rooms-api';
import { useRoomChannel } from '../../features/rooms/use-room-channel';
import { errorMessage } from '../../lib/api-client';

const REMOVED_MESSAGES: Record<RoomRemovedReason, { title: string; text: string }> = {
  kicked: {
    title: 'Bạn đã được mời ra khỏi phòng',
    text: 'Host đã mời bạn ra khỏi phòng thi này.',
  },
  banned: { title: 'Bạn đã bị cấm khỏi phòng', text: 'Bạn không thể vào lại phòng thi này.' },
  rejected: {
    title: 'Yêu cầu tham gia bị từ chối',
    text: 'Host đã từ chối yêu cầu làm người chơi của bạn.',
  },
  closed: { title: 'Phòng đã đóng', text: 'Host đã đóng phòng thi này.' },
  replaced: {
    title: 'Phòng đang mở ở nơi khác',
    text: 'Bạn vừa mở phòng này ở một tab hoặc thiết bị khác. Mỗi tài khoản chỉ có một kết nối trong phòng.',
  },
  left: { title: 'Bạn đã rời phòng', text: 'Bạn không còn ở trong phòng thi này.' },
  timeout: {
    title: 'Hết thời gian giữ chỗ',
    text: 'Bạn mất kết nối quá lâu nên vị trí trong phòng đã được giải phóng.',
  },
};

const primaryAction =
  'inline-flex h-12 items-center justify-center rounded-xl bg-accent-400 px-5 font-extrabold text-stage-900 no-underline hover:bg-accent-500 hover:text-stage-900 hover:no-underline';
const secondaryAction =
  'inline-flex h-12 items-center justify-center rounded-xl border border-stage-700 px-5 font-semibold text-white no-underline hover:bg-white/5 hover:text-white hover:no-underline';

function Room({ roomId }: { roomId: string }) {
  const channel = useRoomChannel(roomId);
  const { state } = channel;
  const isHost = state?.audience === 'host';
  const me = useMyParticipation(
    roomId,
    Boolean(state) && !isHost && !channel.removed,
    state?.version,
  );

  if (channel.removed) {
    const message = REMOVED_MESSAGES[channel.removed];
    return (
      <StageMessage
        title={message.title}
        actions={
          channel.removed === 'replaced' ? (
            <button type="button" className={primaryAction} onClick={channel.reconnect}>
              Dùng phòng ở tab này
            </button>
          ) : isHost ? (
            <Link to="/phong-thi" className={primaryAction}>
              Về danh sách phòng
            </Link>
          ) : (
            <Link to="/vao-phong" className={primaryAction}>
              Vào phòng khác
            </Link>
          )
        }
      >
        {message.text}
      </StageMessage>
    );
  }

  if (channel.error) {
    const notInRoom = channel.error.code === RoomErrorCode.NotInRoom;
    return (
      <StageMessage
        title={notInRoom ? 'Bạn chưa vào phòng này' : 'Không vào được phòng'}
        actions={
          <>
            <Link to="/vao-phong" className={primaryAction}>
              Nhập mã phòng
            </Link>
            {!notInRoom && (
              <button type="button" className={secondaryAction} onClick={channel.reconnect}>
                Thử lại
              </button>
            )}
          </>
        }
      >
        {notInRoom
          ? 'Hãy vào phòng bằng mã phòng hoặc link mời Host gửi cho bạn.'
          : channel.error.message}
      </StageMessage>
    );
  }

  if (!state || (!isHost && !me.data && !me.isError)) {
    return (
      <StageMessage title="Đang vào phòng…">
        <span role="status">Đang kết nối tới phòng thi.</span>
      </StageMessage>
    );
  }

  if (!isHost && me.isError) {
    return (
      <StageMessage
        title="Bạn không còn ở trong phòng"
        actions={
          <Link to="/vao-phong" className={primaryAction}>
            Vào phòng khác
          </Link>
        }
      >
        {errorMessage(me.error)}
      </StageMessage>
    );
  }

  const self = !isHost ? (state.players.find((p) => p.id === me.data?.id) ?? me.data) : null;
  const match = channel.match;
  const live = state.room.status === 'in_match' && match !== null && match.status !== 'finished';

  let content;
  if (live) {
    content =
      match.audience === 'host' ? (
        <HostMatch
          view={match}
          room={state}
          clockOffset={channel.clockOffset}
          onCommand={channel.sendCommand}
        />
      ) : match.audience === 'player' ? (
        <PlayerMatch
          view={match}
          room={state}
          clockOffset={channel.clockOffset}
          actions={{ sendAnswer: channel.sendAnswer, buzz: channel.buzz }}
        />
      ) : (
        <SpectatorMatch
          view={match}
          room={state}
          clockOffset={channel.clockOffset}
          onSendReaction={channel.sendReaction}
        />
      );
  } else if (state.room.status === 'in_match' && match?.status !== 'finished') {
    content = (
      <main className="flex flex-1 items-center justify-center p-4">
        <p role="status" className="text-stage-200">
          Đang tải trận đấu…
        </p>
      </main>
    );
  } else {
    content = isHost ? (
      <HostLobby state={state} onSendReaction={channel.sendReaction} />
    ) : (
      me.data && <MemberLobby state={state} me={me.data} onSendReaction={channel.sendReaction} />
    );
  }

  return (
    <StagePage>
      {content}
      {match?.status === 'finished' && (
        <MatchResultDialog view={match} onClose={channel.dismissMatch} />
      )}
      <ReactionLayer reactions={channel.reactions} />
      {channel.connection === 'offline' && channel.offlineSince !== null && (
        <ReconnectOverlay
          offlineSince={channel.offlineSince}
          graceSeconds={state.reconnectGraceSeconds}
          holdsSpot={!isHost}
          seatLabel={self?.seat ? `${self.seat} · ${self.displayName}` : null}
          onRetry={channel.reconnect}
        />
      )}
    </StagePage>
  );
}

/** Phòng thi `/phong/:roomId`: sảnh chờ của Host hoặc người tham gia, đồng bộ realtime. */
export function RoomPage() {
  const { roomId = '' } = useParams();
  return <Room key={roomId} roomId={roomId} />;
}
