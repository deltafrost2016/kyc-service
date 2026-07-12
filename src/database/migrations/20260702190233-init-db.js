'use strict';

/**
 * Initial schema: pgvector extension, analyses (RAG knowledge base) and jobs
 * (per-request lifecycle). analyses is created first because jobs.reused_from
 * references it. Vector dimension follows EMBEDDING_DIM (default 1408).
 */

const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM || 1408);

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;'); // gen_random_uuid()

    await queryInterface.sequelize.query(`
      CREATE TYPE job_status AS ENUM
        ('QUEUED','EXTRACTED','VALIDATED','DONE','FAILED');
    `);
    await queryInterface.sequelize.query(`
      CREATE TYPE analysis_source AS ENUM
        ('FRESH','CACHE_EXACT','CACHE_SEMANTIC');
    `);

    // Persistent RAG knowledge base (dedup source of truth).
    await queryInterface.sequelize.query(`
      CREATE TABLE analyses (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        content_hash  text UNIQUE NOT NULL,
        embedding     vector(${EMBEDDING_DIM}) NOT NULL,
        document_type text,
        extracted     jsonb NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX idx_analyses_embedding
        ON analyses USING hnsw (embedding vector_cosine_ops);
    `);

    // Per-request lifecycle.
    await queryInterface.sequelize.query(`
      CREATE TABLE jobs (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        status        job_status NOT NULL DEFAULT 'QUEUED',
        source        analysis_source,
        content_hash  text,
        reused_from   uuid REFERENCES analyses(id),
        document_type text,
        extracted     jsonb,
        rule_results  jsonb,
        confidence    jsonb,
        error         text,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        completed_at  timestamptz
      );
    `);
    await queryInterface.sequelize.query('CREATE INDEX idx_jobs_status ON jobs(status);');
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS jobs;');
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS analyses;');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS analysis_source;');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS job_status;');
  },
};
