import {
  DataTypes,
  Model,
  Sequelize,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../../lib/db';
import type { Extracted } from '../../domain/extractionSchema';

/**
 * Sequelize model for the `analyses` table (RAG knowledge base). `embedding`
 * is representational only (Sequelize has no native pgvector type) — writes
 * go through an escaped SQL literal and nearest-neighbor reads stay a raw
 * query, both in repositories/analysisRepository.ts.
 */
export class Analysis extends Model<InferAttributes<Analysis>, InferCreationAttributes<Analysis>> {
  declare id: CreationOptional<string>;

  declare content_hash: string;

  declare embedding: string;

  declare document_type: string | null;

  declare extracted: Extracted;

  declare readonly created_at: CreationOptional<string>;
}

Analysis.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.literal('gen_random_uuid()'),
    },
    content_hash: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    embedding: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    document_type: DataTypes.STRING,
    extracted: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    created_at: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'analyses',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  },
);

export default Analysis;
