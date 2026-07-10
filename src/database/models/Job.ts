import {
  DataTypes,
  Model,
  Sequelize,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../../lib/db.js';
import type { Extracted } from '../../domain/extractionSchema.js';
import type { RuleResults } from '../../domain/rules/types.js';
import type { Confidence } from '../../domain/confidence.js';

/** Sequelize model for the `jobs` table (per-request lifecycle). */
export class Job extends Model<InferAttributes<Job>, InferCreationAttributes<Job>> {
  declare id: CreationOptional<string>;

  declare status: CreationOptional<string>;

  declare source: string | null;

  declare content_hash: string | null;

  declare reused_from: string | null;

  declare document_type: string | null;

  declare extracted: Extracted | null;

  declare rule_results: RuleResults | null;

  declare confidence: Confidence | null;

  declare error: string | null;

  declare completed_at: string | null;

  declare readonly created_at: CreationOptional<string>;

  declare readonly updated_at: CreationOptional<string>;
}

Job.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.literal('gen_random_uuid()'),
    },
    status: {
      type: DataTypes.ENUM('QUEUED', 'EXTRACTED', 'VALIDATED', 'DONE', 'FAILED'),
      allowNull: false,
      defaultValue: 'QUEUED',
    },
    source: DataTypes.ENUM('FRESH', 'CACHE_EXACT', 'CACHE_SEMANTIC'),
    content_hash: DataTypes.STRING,
    reused_from: {
      type: DataTypes.UUID,
      references: {
        model: 'analyses',
        key: 'id',
      },
    },
    document_type: DataTypes.STRING,
    extracted: DataTypes.JSONB,
    rule_results: DataTypes.JSONB,
    confidence: DataTypes.JSONB,
    error: DataTypes.TEXT,
    completed_at: DataTypes.DATE,
    created_at: DataTypes.DATE,
    updated_at: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'jobs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default Job;
