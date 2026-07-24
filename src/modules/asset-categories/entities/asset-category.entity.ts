import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

@Entity('asset_categories')
export class AssetCategory {
  @PrimaryGeneratedColumn({ name: 'category_id' })
  categoryId: number;

  @Column()
  categoryName: string;

  @Column({
    nullable: true,
    comment:
      'hardware / license / vehicle / tool / furniture ... single source of truth ของ type (ไม่ซ้ำกับ assets แล้ว)',
  })
  assetType: string;

  @Column({ name: 'parent_category_id', nullable: true })
  parentCategoryId: number;

  @ManyToOne(() => AssetCategory, (c) => c.children, { nullable: true })
  @JoinColumn({ name: 'parent_category_id' })
  parent: AssetCategory;

  @OneToMany(() => AssetCategory, (c) => c.parent)
  children: AssetCategory[];
}
