const assert = require('assert');
const { isDemoUser, handleCreateProject } = require('../api/supabase');

async function runDemoLimitTests() {
  console.log('================================================================');
  console.log('DEMO LIFETIME PROJECT LIMIT VERIFICATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // 1. isDemoUser helper classification
  test('isDemoUser: Normal Photographer is false', () => {
    assert.strictEqual(isDemoUser({ role: 'Photographer', paket: '1 Bulan' }), false);
    assert.strictEqual(isDemoUser({ role: 'Photographer', paket: '6 Bulan' }), false);
    assert.strictEqual(isDemoUser({ role: 'Photographer', paket: '1 Tahun' }), false);
  });

  test('isDemoUser: Admin is always false', () => {
    assert.strictEqual(isDemoUser({ role: 'Admin', paket: 'Demo' }), false);
    assert.strictEqual(isDemoUser({ role: 'Admin', username: 'demo' }), false);
  });

  test('isDemoUser: Demo role is true', () => {
    assert.strictEqual(isDemoUser({ role: 'Demo', paket: '1 Bulan' }), true);
    assert.strictEqual(isDemoUser({ Role: 'Demo', Paket: '1 Bulan' }), true);
  });

  test('isDemoUser: Paket Demo / Free / Free Plan is true', () => {
    assert.strictEqual(isDemoUser({ role: 'Photographer', paket: 'Demo' }), true);
    assert.strictEqual(isDemoUser({ role: 'Photographer', paket: 'Paket Demo 7 Hari' }), true);
    assert.strictEqual(isDemoUser({ role: 'Photographer', paket: 'Free' }), true);
    assert.strictEqual(isDemoUser({ role: 'Photographer', paket: 'Free Plan' }), true);
  });

  test('isDemoUser: demo username is true', () => {
    assert.strictEqual(isDemoUser({ role: 'Photographer', username: 'demo' }), true);
    assert.strictEqual(isDemoUser({ role: 'Photographer', username: 'demo_user' }), true);
  });

  // 2. Mock res object
  function createMockRes() {
    return {
      statusCode: 200,
      headers: {},
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      },
      setHeader(k, v) {
        this.headers[k] = v;
      }
    };
  }

  // 3. Demo user with ProjectCreated >= 1 is rejected immediately
  await testAsync('Demo user with ProjectCreated: 1 is blocked with HTTP 403', async () => {
    const res = createMockRes();
    const payload = {
      formData: { namaClient: 'Test Client', nomorWA: '08123456789' },
      authUser: {
        username: 'demouser123',
        role: 'Demo',
        paket: 'Demo',
        ProjectCreated: '1',
        projectCreated: 1,
        rawUser: {
          Username: 'demouser123',
          Role: 'Demo',
          Paket: 'Demo',
          ProjectCreated: '1'
        }
      }
    };

    await handleCreateProject(payload, res);
    assert.strictEqual(res.statusCode, 403);
    assert.ok(res.body && res.body.message && res.body.message.includes('maksimal 1 Project'));
  });

  // 4. Demo user who deleted their projects still has ProjectCreated >= 1 and is blocked
  await testAsync('Demo user with 0 active projects but lifetime ProjectCreated: 1 is blocked', async () => {
    const res = createMockRes();
    const payload = {
      formData: { namaClient: 'Second Project After Delete', nomorWA: '08123456789' },
      authUser: {
        username: 'demouser_deleted',
        role: 'Demo',
        paket: 'Free',
        ProjectCreated: '1',
        projectCreated: 1,
        rawUser: {
          Username: 'demouser_deleted',
          Role: 'Demo',
          Paket: 'Free',
          ProjectCreated: '1'
        }
      }
    };

    await handleCreateProject(payload, res);
    assert.strictEqual(res.statusCode, 403);
    assert.ok(res.body && res.body.message && res.body.message.includes('maksimal 1 Project'));
  });

  console.log('\n================================================================');
  console.log(`DEMO LIMIT TESTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
}

runDemoLimitTests();
