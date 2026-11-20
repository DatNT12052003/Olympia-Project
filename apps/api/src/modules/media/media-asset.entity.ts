import type { MediaKind } from '@olympia/shared';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Tệp media trên object storage (BR-QB-02). `pending` cho tới khi server kiểm tra xong tệp. */
@Entity({ name: 'media_assets' })
export class MediaAssetEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'owner_user_id', type: 'uuid' })
  ownerUserId!: string;

  @Column({ type: 'text' })
  kind!: MediaKind;

  @Column({ name: 'content_type', type: 'varchar', length: 100 })
  contentType!: string;

  @Column({ name: 'size_bytes', type: 'integer' })
  sizeBytes!: number;

  @Column({ name: 'storage_key', type: 'text' })
  storageKey!: string;

  @Column({ name: 'original_name', type: 'varchar', length: 255, nullable: true })
  originalName!: string | null;

  @Column({ type: 'text', default: 'pending' })
  status!: 'pending' | 'ready';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'ready_at', type: 'timestamptz', nullable: true })
  readyAt!: Date | null;
}
