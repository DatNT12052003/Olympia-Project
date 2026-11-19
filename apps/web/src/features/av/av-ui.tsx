import {
  useConnectionQualityIndicator,
  useIsSpeaking,
  useLocalParticipant,
  useLocalParticipantPermissions,
  useParticipants,
  useParticipantTracks,
  useTrackVolume,
  VideoTrack,
} from '@livekit/components-react';
import { avParticipantMetadataSchema } from '@olympia/shared';
import { ConnectionQuality, type Participant, Track } from 'livekit-client';
import { type ReactNode, useState } from 'react';
import {
  CameraIcon,
  CameraOffIcon,
  MicIcon,
  MicOffIcon,
  SpeakerIcon,
  SpeakerOffIcon,
} from '../../components/icons';
import { useAvPolicy, useUpdateAvPolicy } from './av-api';
import { readDevicePrefs, useAv, writeDevicePrefs } from './av-context';

/** Thành phần video/âm thanh (thẻ người chơi có video, nút micro/camera, điều khiển của Host). */

/** Ai hiển thị trong ô: Host, hoặc người tham gia phòng theo id. */
export type AvTarget = { role: 'host' } | { participantId: string };

/** Mã nguồn phát trong quyền LiveKit (`TrackSource` của protocol). */
const SOURCE_CAMERA = 1;
const SOURCE_MICROPHONE = 2;

function matches(participant: Participant, target: AvTarget): boolean {
  try {
    const meta = avParticipantMetadataSchema.parse(JSON.parse(participant.metadata ?? ''));
    return 'role' in target ? meta.role === 'host' : meta.participantId === target.participantId;
  } catch {
    return false;
  }
}

function LiveTile({
  participant,
  fallback,
  videoClassName,
}: {
  participant: Participant;
  fallback: ReactNode;
  videoClassName: string;
}) {
  const tracks = useParticipantTracks(
    [Track.Source.Camera, Track.Source.Microphone],
    participant.identity,
  );
  const speaking = useIsSpeaking(participant);
  const { quality } = useConnectionQualityIndicator({ participant });
  const camera = tracks.find((t) => t.source === Track.Source.Camera);
  const mic = tracks.find((t) => t.source === Track.Source.Microphone);
  const showVideo = camera && !camera.publication.isMuted;
  const micOn = mic && !mic.publication.isMuted;
  return (
    <>
      {showVideo ? (
        <VideoTrack
          trackRef={camera}
          className={`absolute inset-0 size-full object-cover ${videoClassName}`}
        />
      ) : (
        fallback
      )}
      {speaking && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] ring-[3px] ring-inset ring-green-300"
        />
      )}
      <span className="pointer-events-none absolute bottom-1.5 left-1.5 flex gap-1">
        {!micOn && (
          <span
            title="Micro đang tắt"
            className="flex size-6 items-center justify-center rounded-md bg-stage-900/85 text-orange-300"
          >
            <MicOffIcon size={14} />
            <span className="sr-only">Micro đang tắt</span>
          </span>
        )}
        {(quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost) && (
          <span className="rounded-md bg-stage-900/85 px-1.5 py-0.5 text-[10px] font-bold text-orange-300">
            Mạng yếu
          </span>
        )}
      </span>
    </>
  );
}

function ConnectedTile(props: { target: AvTarget; fallback: ReactNode; videoClassName: string }) {
  const participants = useParticipants();
  const participant = participants.find((p) => matches(p, props.target));
  if (!participant) return props.fallback;
  return <LiveTile participant={participant} {...props} />;
}

/**
 * Video của Host/một người chơi trong ô có sẵn (cha đặt `relative`). Chưa kết nối, không bật
 * camera hoặc không có thiết bị: hiện `fallback` (ảnh đại diện, BR-AV-01).
 */
export function AvTile({
  target,
  fallback,
  mirror = false,
}: {
  target: AvTarget;
  fallback: ReactNode;
  /** Lật ngang video của chính mình. */
  mirror?: boolean;
}) {
  const { status } = useAv();
  if (status !== 'ready') return fallback;
  return (
    <ConnectedTile
      target={target}
      fallback={fallback}
      videoClassName={mirror ? '-scale-x-100' : ''}
    />
  );
}

const toggleBase =
  'flex h-[52px] items-center justify-center gap-2.5 rounded-xl border border-stage-700 bg-stage-800 px-3.5 text-sm font-semibold text-white hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60';

function MicLevel() {
  const { microphoneTrack } = useLocalParticipant();
  const track = microphoneTrack?.track;
  const volume = useTrackVolume(
    track?.kind === Track.Kind.Audio ? (track as Parameters<typeof useTrackVolume>[0]) : undefined,
  );
  const percent = Math.min(100, Math.round(volume * 300));
  return (
    <div className="flex items-center gap-2.5 text-[13px] text-stage-200">
      <span>Âm lượng mic</span>
      <span
        role="meter"
        aria-label="Âm lượng micro"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 flex-1 overflow-hidden rounded-full bg-stage-800"
      >
        <span className="block h-full bg-green-300" style={{ width: `${percent}%` }} />
      </span>
    </div>
  );
}

function PublisherControls({ showLevel }: { showLevel: boolean }) {
  const { localParticipant, isCameraEnabled, isMicrophoneEnabled } = useLocalParticipant();
  const permissions = useLocalParticipantPermissions();
  const [error, setError] = useState<string | null>(null);
  const sources = permissions?.canPublishSources ?? [];
  // Không có danh sách nguồn = được phát mọi nguồn (quy ước LiveKit), trừ khi bị tắt quyền phát.
  const allowed = (source: number) =>
    permissions?.canPublish !== false && (sources.length === 0 || sources.includes(source));
  const cameraLocked = !allowed(SOURCE_CAMERA);
  const micLocked = !allowed(SOURCE_MICROPHONE);

  async function toggle(kind: 'camera' | 'microphone') {
    setError(null);
    const prefs = readDevicePrefs();
    try {
      if (kind === 'camera') {
        await localParticipant.setCameraEnabled(!isCameraEnabled);
        writeDevicePrefs({ ...prefs, camera: !isCameraEnabled });
      } else {
        await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
        writeDevicePrefs({ ...prefs, microphone: !isMicrophoneEnabled });
      }
    } catch {
      setError(
        kind === 'camera'
          ? 'Không bật được camera. Hãy cho phép trình duyệt dùng camera.'
          : 'Không bật được micro. Hãy cho phép trình duyệt dùng micro.',
      );
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          aria-pressed={isCameraEnabled}
          disabled={cameraLocked}
          onClick={() => void toggle('camera')}
          className={toggleBase}
        >
          {isCameraEnabled ? (
            <CameraIcon size={20} className="text-green-300" />
          ) : (
            <CameraOffIcon size={20} className="text-orange-300" />
          )}
          {cameraLocked ? 'Host khóa camera' : isCameraEnabled ? 'Camera bật' : 'Camera tắt'}
        </button>
        <button
          type="button"
          aria-pressed={isMicrophoneEnabled}
          disabled={micLocked}
          onClick={() => void toggle('microphone')}
          className={toggleBase}
        >
          {isMicrophoneEnabled ? (
            <MicIcon size={20} className="text-green-300" />
          ) : (
            <MicOffIcon size={20} className="text-orange-300" />
          )}
          {micLocked ? 'Host khóa micro' : isMicrophoneEnabled ? 'Micro bật' : 'Micro tắt'}
        </button>
      </div>
      {showLevel && isMicrophoneEnabled && <MicLevel />}
      {(cameraLocked || micLocked) && (
        <p className="text-[13px] text-amber-200">
          Host đang khóa{' '}
          {[cameraLocked && 'camera', micLocked && 'micro'].filter(Boolean).join(' và ')} của bạn.
        </p>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-orange-300">
          {error}
        </p>
      )}
    </div>
  );
}

/** Trạng thái kết nối video khi chưa sẵn sàng (thông báo ngắn, nút thử lại). */
export function AvStatusNote() {
  const { status, retry } = useAv();
  if (status === 'ready' || status === 'off') return null;
  const text =
    status === 'connecting'
      ? 'Đang kết nối video…'
      : status === 'unsupported'
        ? 'Trình duyệt này không hỗ trợ video call. Bạn vẫn thi bình thường.'
        : 'Không kết nối được video. Trận đấu vẫn diễn ra bình thường.';
  return (
    <p role="status" className="flex flex-wrap items-center gap-2 text-[13px] text-stage-200">
      {text}
      {status === 'unavailable' && (
        <button
          type="button"
          onClick={retry}
          className="h-8 rounded-md border border-stage-700 px-2.5 font-semibold text-white hover:bg-white/5"
        >
          Thử lại
        </button>
      )}
    </p>
  );
}

/** Bật/tắt camera, micro của mình (sảnh chờ: "Kiểm tra thiết bị"). */
export function LocalAvControls({ showLevel = false }: { showLevel?: boolean }) {
  const { status, canPublish } = useAv();
  return (
    <div className="flex flex-col gap-2.5">
      {status === 'ready' && canPublish && <PublisherControls showLevel={showLevel} />}
      <AvStatusNote />
    </div>
  );
}

/** Bật/tắt âm thanh phát ra trên máy này (khán giả). */
export function SpeakerToggle() {
  const { status, speakerOff, setSpeakerOff } = useAv();
  if (status !== 'ready') return null;
  return (
    <button
      type="button"
      aria-pressed={!speakerOff}
      aria-label={speakerOff ? 'Bật âm thanh' : 'Tắt âm thanh'}
      onClick={() => setSpeakerOff(!speakerOff)}
      className="flex size-[52px] items-center justify-center rounded-full bg-stage-900 text-white hover:bg-stage-700"
    >
      {speakerOff ? <SpeakerOffIcon size={22} /> : <SpeakerIcon size={22} />}
    </button>
  );
}

/** Khóa/mở micro, camera của một người chơi (thẻ người chơi ở màn Host, 11.2). */
export function HostLockButtons({
  roomId,
  participantId,
  name,
}: {
  roomId: string;
  participantId: string;
  name: string;
}) {
  const policy = useAvPolicy(roomId, true);
  const update = useUpdateAvPolicy(roomId);
  const lock = policy.data?.locks[participantId] ?? { mic: false, cam: false };
  const button =
    'flex size-8 items-center justify-center rounded-lg bg-stage-900/85 text-white hover:bg-stage-700 disabled:opacity-50';
  return (
    <span className="flex gap-1">
      <button
        type="button"
        aria-pressed={lock.mic}
        aria-label={lock.mic ? `Mở khóa micro ${name}` : `Tắt micro ${name}`}
        title={lock.mic ? 'Mở khóa micro' : 'Tắt và khóa micro'}
        disabled={update.isPending || !policy.data}
        onClick={() => update.mutate({ type: 'lock', participantId, mic: !lock.mic })}
        className={button}
      >
        {lock.mic ? <MicOffIcon size={16} className="text-orange-300" /> : <MicIcon size={16} />}
      </button>
      <button
        type="button"
        aria-pressed={lock.cam}
        aria-label={lock.cam ? `Mở khóa camera ${name}` : `Tắt camera ${name}`}
        title={lock.cam ? 'Mở khóa camera' : 'Tắt và khóa camera'}
        disabled={update.isPending || !policy.data}
        onClick={() => update.mutate({ type: 'lock', participantId, cam: !lock.cam })}
        className={button}
      >
        {lock.cam ? (
          <CameraOffIcon size={16} className="text-orange-300" />
        ) : (
          <CameraIcon size={16} />
        )}
      </button>
    </span>
  );
}

/** Khối "Âm thanh và hình ảnh" của Host (HostControl): thiết bị của mình và quyền nói trong phòng. */
export function HostAvPanel({ roomId, inMatch }: { roomId: string; inMatch: boolean }) {
  const policy = useAvPolicy(roomId, true);
  const update = useUpdateAvPolicy(roomId);
  const data = policy.data;
  return (
    <section
      aria-labelledby="av-heading"
      className="flex flex-col gap-3 rounded-[18px] bg-stage-800 p-[18px]"
    >
      <h2 id="av-heading" className="text-base font-bold">
        Âm thanh và hình ảnh
      </h2>
      <LocalAvControls />
      <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
        <span>
          Chỉ người đến lượt được nói
          {!inMatch && (
            <span className="block text-xs text-stage-200">Áp dụng khi trận diễn ra</span>
          )}
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={data?.turnOnly ?? false}
          disabled={!data || update.isPending}
          onChange={(event) => update.mutate({ type: 'turn_only', value: event.target.checked })}
          className="h-[22px] w-10 accent-accent-400"
        />
      </label>
      <button
        type="button"
        aria-pressed={data?.muteAll ?? false}
        disabled={!data || update.isPending}
        onClick={() => update.mutate({ type: 'mute_all', value: !data?.muteAll })}
        className="h-10 rounded-[10px] border border-stage-700 text-sm font-semibold hover:bg-white/5 disabled:opacity-50"
      >
        {data?.muteAll ? 'Mở tiếng toàn phòng' : 'Tắt tiếng toàn phòng'}
      </button>
      {update.isError && (
        <p role="alert" className="text-[13px] text-orange-300">
          Không cập nhật được, hãy thử lại.
        </p>
      )}
    </section>
  );
}
