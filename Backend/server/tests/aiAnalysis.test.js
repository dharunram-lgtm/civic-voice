/**
 * aiAnalysis.test.js
 * Integration test suite for the AI Image Analysis endpoint.
 */

const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongod;
let app;
let citizenToken;

const tinyPngPath = path.join(__dirname, '__fixtures__', 'tiny.png');
const textFilePath = path.join(__dirname, '__fixtures__', 'test.txt');

// Test citizen credentials
const citizen = {
  name: 'John Citizen',
  email: 'john.citizen@test.com',
  phone: '0987654321',
  password: 'Passw0rd!123',
  role: 'Citizen',
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.JWT_SECRET = 'ai-test-secret-key';
  process.env.NODE_ENV = 'test';

  await mongoose.connect(process.env.MONGO_URI);
  app = require('../app');

  // Create test files/directories
  const dir = path.dirname(tinyPngPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  // Tiny 1x1 PNG Buffer
  const tinyPngBuffer = Buffer.from(
    '89504e470d0a1a0a0000000d494844520000000100000001080600000' +
      '01f15c4890000000a49444154789c6360000002000155a1a5e0000000' +
      '0049454e44ae426082',
    'hex'
  );
  fs.writeFileSync(tinyPngPath, tinyPngBuffer);

  // Tiny plain text file
  fs.writeFileSync(textFilePath, 'Hello World!');

  // Register and Login to get citizenToken
  await request(app).post('/api/auth/register').send(citizen);
  const loginRes = await request(app).post('/api/auth/login').send({
    email: citizen.email,
    password: citizen.password,
  });
  citizenToken = loginRes.body.token;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongod) await mongod.stop();
  
  // Cleanup test files
  if (fs.existsSync(tinyPngPath)) fs.unlinkSync(tinyPngPath);
  if (fs.existsSync(textFilePath)) fs.unlinkSync(textFilePath);
});

describe('AI Image Analysis API Integration Tests', () => {
  test('POST /api/ai/image-analysis - should fail with 401 if unauthenticated', async () => {
    const res = await request(app)
      .post('/api/ai/image-analysis')
      .attach('image', tinyPngPath);

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('POST /api/ai/image-analysis - should succeed with 200 when authenticated and valid image provided', async () => {
    const res = await request(app)
      .post('/api/ai/image-analysis')
      .set('Authorization', `Bearer ${citizenToken}`)
      .attach('image', tinyPngPath);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('description');
    expect(res.body).toHaveProperty('objects');
    expect(res.body).toHaveProperty('confidence');
    expect(res.body.objects).toBeInstanceOf(Array);
    expect(typeof res.body.description).toBe('string');
    expect(typeof res.body.confidence).toBe('number');
  });

  test('POST /api/ai/image-analysis - should return 400 (INVALID_FILE_TYPE) when sending a non-image file', async () => {
    const res = await request(app)
      .post('/api/ai/image-analysis')
      .set('Authorization', `Bearer ${citizenToken}`)
      .attach('image', textFilePath);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('INVALID_FILE_TYPE');
  });

  test('POST /api/ai/image-analysis - should return 400 (NO_FILE_UPLOADED) when sending request without file', async () => {
    const res = await request(app)
      .post('/api/ai/image-analysis')
      .set('Authorization', `Bearer ${citizenToken}`);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('NO_FILE_UPLOADED');
  });

  test('POST /api/ai/image-analysis - should return 400 (MulterError or FILE_TOO_LARGE) when file exceeds 5MB', async () => {
    // Generate a 6MB Buffer
    const largeBuffer = Buffer.alloc(6 * 1024 * 1024);
    
    const res = await request(app)
      .post('/api/ai/image-analysis')
      .set('Authorization', `Bearer ${citizenToken}`)
      .attach('image', largeBuffer, { filename: 'large_image.png', contentType: 'image/png' });

    // Multer size limits can cause it to return 400 with either FILE_TOO_LARGE or general MulterError
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
