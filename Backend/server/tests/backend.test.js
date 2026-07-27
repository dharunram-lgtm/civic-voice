/**
 * backend.test.js
 * ------------------------------------------------------------------
 * Full-stack integration test suite for the Smart Civic Complaint
 * Management System backend (Express + Mongoose + JWT + Multer).
 * ------------------------------------------------------------------
 */

const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongod;
let app;

// ---------------------------------------------------------------
// Global setup / teardown
// ---------------------------------------------------------------
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
  process.env.NODE_ENV = 'test';

  // Explicitly connect to the in-memory database
  await mongoose.connect(process.env.MONGO_URI);

  // Import AFTER env vars are set so app connects to in-memory instance
  app = require('../app');
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongod) await mongod.stop();
});

// ---------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------
const citizen = {
  name: 'Asha Menon',
  email: 'asha.citizen@test.com',
  phone: '1234567890',
  password: 'Passw0rd!123',
  role: 'Citizen',
};

const officer = {
  name: 'Officer Rao',
  email: 'rao.officer@test.com',
  phone: '1234567891',
  password: 'Passw0rd!123',
  role: 'Officer',
  department: 'Sanitation',
};

const admin = {
  name: 'Admin Kumar',
  email: 'kumar.admin@test.com',
  phone: '1234567892',
  password: 'Passw0rd!123',
  role: 'Admin',
};

let citizenToken, officerToken, adminToken;
let createdComplaintId;

// Tiny 1x1 pixel PNG for upload tests
const tinyPngPath = path.join(__dirname, '__fixtures__', 'tiny.png');

beforeAll(() => {
  const dir = path.dirname(tinyPngPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tinyPngBuffer = Buffer.from(
    '89504e470d0a1a0a0000000d494844520000000100000001080600000' +
      '01f15c4890000000a49444154789c6360000002000155a1a5e0000000' +
      '0049454e44ae426082',
    'hex'
  );
  fs.writeFileSync(tinyPngPath, tinyPngBuffer);
});

// =================================================================
// 1. SERVER HEALTH
// =================================================================
describe('Server health', () => {
  test('GET / returns 200 welcome message', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });
});

// =================================================================
// 2. AUTH
// =================================================================
describe('Auth flow (authController / authRoutes / authMiddleware)', () => {
  test('registers a new citizen', async () => {
    const res = await request(app).post('/api/auth/register').send(citizen);
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('email', citizen.email);
    expect(res.body.data).not.toHaveProperty('password');
  });

  test('registers an officer and an admin', async () => {
    const r1 = await request(app).post('/api/auth/register').send(officer);
    const r2 = await request(app).post('/api/auth/register').send(admin);
    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(201);
  });

  test('rejects duplicate email registration', async () => {
    const res = await request(app).post('/api/auth/register').send(citizen);
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('rejects registration with missing required fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'incomplete@test.com' });
    expect(res.statusCode).toBe(400);
  });

  test('logs in with correct credentials and returns JWT', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: citizen.email,
      password: citizen.password,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token');
    citizenToken = res.body.token;

    const officerRes = await request(app).post('/api/auth/login').send({
      email: officer.email,
      password: officer.password,
    });
    officerToken = officerRes.body.token;

    const adminRes = await request(app).post('/api/auth/login').send({
      email: admin.email,
      password: admin.password,
    });
    adminToken = adminRes.body.token;

    expect(citizenToken).toBeDefined();
    expect(officerToken).toBeDefined();
    expect(adminToken).toBeDefined();
  });

  test('rejects login with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: citizen.email, password: 'wrongpassword' });
    expect(res.statusCode).toBe(401);
  });

  test('blocks access to a protected profile route without a token', async () => {
    const res = await request(app).get('/api/auth/profile');
    expect(res.statusCode).toBe(401);
  });

  test('allows access to profile route with a valid token', async () => {
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${citizenToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty('email', citizen.email);
  });

  test('rejects a malformed / tampered JWT', async () => {
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', 'Bearer not.a.valid.token');
    expect(res.statusCode).toBe(401);
  });
});

// =================================================================
// 3. COMPLAINTS
// =================================================================
describe('Complaint lifecycle (complaintController / complaintRoutes)', () => {
  test('citizen can file a complaint with an image upload', async () => {
    const res = await request(app)
      .post('/api/complaints')
      .set('Authorization', `Bearer ${citizenToken}`)
      .field('title', 'Overflowing garbage bin')
      .field('description', 'Bin on 4th Cross Street has not been cleared in a week')
      .field('department', 'Sanitation')
      .field('address', 'Chennai, TN')
      .attach('beforeImage', tinyPngPath);

    expect(res.statusCode).toBe(201);
    expect(res.body.data).toHaveProperty('_id');
    expect(res.body.data).toHaveProperty('title', 'Overflowing garbage bin');
    createdComplaintId = res.body.data._id;
  });

  test('rejects complaint creation without auth', async () => {
    const res = await request(app).post('/api/complaints').send({
      title: 'No auth complaint',
      description: 'Should fail',
    });
    expect(res.statusCode).toBe(401);
  });

  test('rejects an oversized/invalid file type upload', async () => {
    const fakeExe = path.join(__dirname, '__fixtures__', 'malicious.exe');
    fs.writeFileSync(fakeExe, Buffer.from('MZ-fake-binary'));

    const res = await request(app)
      .post('/api/complaints')
      .set('Authorization', `Bearer ${citizenToken}`)
      .field('title', 'Bad file test')
      .field('description', 'Testing MIME filter')
      .field('department', 'Sanitation')
      .attach('beforeImage', fakeExe);

    expect([400, 415, 422]).toContain(res.statusCode);
  });

  test('lists complaints with pagination and sorting', async () => {
    const res = await request(app)
      .get('/api/complaints?page=1&limit=5&sort=-createdAt')
      .set('Authorization', `Bearer ${citizenToken}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty('pagination');
  });

  test('fetches a single complaint by id', async () => {
    const res = await request(app)
      .get(`/api/complaints/${createdComplaintId}`)
      .set('Authorization', `Bearer ${citizenToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data._id).toBe(createdComplaintId);
  });

  test('returns 400/404 (CastError handled) for a malformed complaint id', async () => {
    const res = await request(app)
      .get('/api/complaints/not-a-valid-object-id')
      .set('Authorization', `Bearer ${citizenToken}`);
    expect([400, 404]).toContain(res.statusCode);
    expect(res.body.success).toBe(false);
  });

  test('officer can update complaint status; citizen cannot', async () => {
    const citizenAttempt = await request(app)
      .put(`/api/complaints/${createdComplaintId}`)
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({ status: 'In Progress' });
    expect(citizenAttempt.statusCode).toBe(403);

    const officerAttempt = await request(app)
      .put(`/api/complaints/${createdComplaintId}`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ status: 'In Progress' });
    expect(officerAttempt.statusCode).toBe(200);
    expect(officerAttempt.body.data.status).toBe('In Progress');
  });

  test('only admin can delete a complaint', async () => {
    const officerAttempt = await request(app)
      .delete(`/api/complaints/${createdComplaintId}`)
      .set('Authorization', `Bearer ${officerToken}`);
    expect(officerAttempt.statusCode).toBe(403);

    const adminAttempt = await request(app)
      .delete(`/api/complaints/${createdComplaintId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminAttempt.statusCode).toBe(200);
  });

  test('citizen can file a complaint with dots/special character description and it uses visual description', async () => {
    const res = await request(app)
      .post('/api/complaints')
      .set('Authorization', `Bearer ${citizenToken}`)
      .field('title', 'Pothole on Main St')
      .field('description', '...!!!')
      .field('department', 'Roads')
      .attach('beforeImage', tinyPngPath);

    expect(res.statusCode).toBe(201);
    expect(res.body.data).toHaveProperty('description');
    expect(res.body.data.description).toBe('Major Pothole Damage');
  });
});

// =================================================================
// 4. AI SERVICE FALLBACK (aiService.js)
// =================================================================
describe('AI classification pipeline resilience (aiService.js)', () => {
  test('falls back to local default classification when AI APIs are unreachable', async () => {
    // Override Url properties on the aiService singleton directly to bypass initialization timing
    const aiService = require('../services/aiService');
    const originalYolo = aiService.yoloUrl;
    const originalNlp = aiService.nlpUrl;
    aiService.yoloUrl = 'http://127.0.0.1:1/predict/image';
    aiService.nlpUrl = 'http://127.0.0.1:1/predict/text';

    const res = await request(app)
      .post('/api/complaints')
      .set('Authorization', `Bearer ${citizenToken}`)
      .field('title', 'Broken streetlight')
      .field('description', 'Streetlight has been off for days near the park')
      .field('department', 'Electricity')
      .attach('beforeImage', tinyPngPath);

    expect(res.statusCode).toBe(201);
    expect(res.body.data).toHaveProperty('aiPrediction');
    expect(res.body.data.aiPrediction).toHaveProperty('detectedIssue');
    expect(res.body.data.aiPrediction).toHaveProperty('department');
    expect(res.body.data.aiPrediction).toHaveProperty('priority');

    aiService.yoloUrl = originalYolo;
    aiService.nlpUrl = originalNlp;
  }, 15000);
});

// =================================================================
// 5. DASHBOARD (dashboardController.js aggregates)
// =================================================================
describe('Dashboard aggregates (role-scoped)', () => {
  test('citizen dashboard returns only their own stats', async () => {
    const res = await request(app)
      .get('/api/dashboard/citizen')
      .set('Authorization', `Bearer ${citizenToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty('total');
  });

  test('officer dashboard returns workload aggregates', async () => {
    const res = await request(app)
      .get('/api/dashboard/officer')
      .set('Authorization', `Bearer ${officerToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty('assigned');
  });

  test('admin dashboard returns system-wide growth trends', async () => {
    const res = await request(app)
      .get('/api/dashboard/admin')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty('users');
  });

  test('non-admin is blocked from the admin dashboard', async () => {
    const res = await request(app)
      .get('/api/dashboard/admin')
      .set('Authorization', `Bearer ${citizenToken}`);
    expect(res.statusCode).toBe(403);
  });
});

// =================================================================
// 6. NOTIFICATIONS
// =================================================================
describe('Notifications (notificationController.js)', () => {
  test('citizen receives notifications list', async () => {
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${citizenToken}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('marks all notifications as read', async () => {
    const res = await request(app)
      .put('/api/notifications/mark-all-read')
      .set('Authorization', `Bearer ${citizenToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// =================================================================
// 7. SECURITY MIDDLEWARE
// =================================================================
describe('Security hardening', () => {
  test('sanitizes NoSQL injection attempts in query params', async () => {
    const res = await request(app)
      .get('/api/complaints')
      .query({ title: { $gt: '' } })
      .set('Authorization', `Bearer ${citizenToken}`);
    expect(res.statusCode).not.toBe(500);
  });

  test('sets protective Helmet headers', async () => {
    const res = await request(app).get('/');
    expect(res.headers).toHaveProperty('x-content-type-options', 'nosniff');
  });

  test('enforces rate limiting after excessive requests', async () => {
    const requests = [];
    // Force rate limiter trigger by requesting secure API route
    for (let i = 0; i < 105; i++) {
      requests.push(request(app).get('/api/auth/profile'));
    }
    const results = await Promise.all(requests);
    const tooManyRequests = results.some((r) => r.statusCode === 429);
    expect(tooManyRequests).toBe(true);
  }, 30000);
});

// =================================================================
// Cleanup fixtures written to disk
// =================================================================
afterAll(() => {
  const fixturesDir = path.join(__dirname, '__fixtures__');
  if (fs.existsSync(fixturesDir)) {
    fs.rmSync(fixturesDir, { recursive: true, force: true });
  }
});
