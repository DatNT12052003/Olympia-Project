import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Manager được gán quản lý một tổ chức (DL-005). */
@Entity({ name: 'organization_managers' })
export class OrganizationManagerEntity {
  @PrimaryColumn({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
