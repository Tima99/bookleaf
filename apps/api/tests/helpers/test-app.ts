import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config/env';
import { createLogger } from '../../src/common/logger';
import { buildContainer, type Container } from '../../src/container';
import { connectDatabase } from '../../src/database/connection';
import { seedDatabase } from '../../src/database/seed/seed';
import { FakeLlm } from './fake-llm';
import { ADMIN_EMAIL, PASSWORDS, TEST_DATASET } from './fixtures';

export interface TestContext {
  app: Express;
  container: Container;
  llm: FakeLlm;
  mongo: MongoMemoryServer;
  stop: () => Promise<void>;
}

export async function startTestApp(): Promise<TestContext> {
  const mongo = await MongoMemoryServer.create();
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    MONGODB_URI: mongo.getUri('bookleaf_test'),
    JWT_SECRET: 'test-secret-that-is-definitely-longer-than-32-chars',
    CORS_ORIGINS: 'http://localhost:3000',
    AI_PROVIDER: 'none',
  });
  const logger = createLogger('silent', false);
  await connectDatabase(config.mongoUri, logger);
  const llm = new FakeLlm();
  const container = buildContainer(config, logger, { llm });
  await seedDatabase(TEST_DATASET, {
    authorPassword: PASSWORDS.author,
    adminPassword: PASSWORDS.admin,
    withDemoTickets: false,
    strategies: container.strategies,
  });
  const app = createApp(container, { rateLimitMultiplier: 100 });
  return {
    app,
    container,
    llm,
    mongo,
    stop: async () => {
      await container.jobs.drain();
      await mongoose.disconnect();
      await mongo.stop();
    },
  };
}

/** A logged-in supertest agent that automatically sends the CSRF header. */
export interface Session {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  userId: string;
  get: (url: string) => request.Test;
  post: (url: string, body?: object) => request.Test;
  patch: (url: string, body?: object) => request.Test;
}

export async function login(app: Express, email: string, password: string): Promise<Session> {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200)
    throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  const csrf: string = res.body.data.csrfToken;
  return {
    agent,
    csrf,
    userId: res.body.data.user.id,
    get: (url) => agent.get(url),
    post: (url, body = {}) => agent.post(url).set('X-CSRF-Token', csrf).send(body),
    patch: (url, body = {}) => agent.patch(url).set('X-CSRF-Token', csrf).send(body),
  };
}

export const loginAuthor1 = (app: Express) =>
  login(app, 'asha.verma@example.test', PASSWORDS.author);
export const loginAuthor2 = (app: Express) =>
  login(app, 'dev.malhotra@example.test', PASSWORDS.author);
export const loginAdmin = (app: Express) => login(app, ADMIN_EMAIL, PASSWORDS.admin);
