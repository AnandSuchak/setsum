const http = require('http');
const crypto = require('crypto');
const db = require('./db');

// Config
const PORT = 19385;
let serverInstance = null;

// Helpers to make HTTP requests programmatically using node's built-in 'http' module
function makeRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const reqOptions = {
      hostname: '127.0.0.1',
      port: PORT,
      path: path,
      method: method,
      headers: headers
    };

    const req = http.request(reqOptions, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseBody);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: responseBody });
        }
      });
    });

    req.on('error', (err) => { reject(err); });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Assert helper
function assert(condition, message) {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
}

async function runTests() {
  console.log('==================================================');
  console.log('STARTING SETSUM INTEGRATION TEST SUITE');
  console.log('==================================================');

  // 1. Initialize Database and check seeded rates
  console.log('\n[1/7] Testing DB Initialization & Seeding...');
  await db.initDb();
  
  const rates = await db.all('SELECT * FROM pay_rates');
  console.log(`- Seeded pay rates count: ${rates.length}`);
  assert(rates.length === 8, 'Should have exactly 8 predefined union rates seeded (4 day, 4 night)');

  const hasFaaDay = rates.some(r => r.name === 'FAA/PACT Daily Rate' && r.shift_type === 'Day' && r.base_rate === 111.21);
  const hasFaaNight = rates.some(r => r.name === 'FAA/PACT Daily Rate' && r.shift_type === 'Night' && r.base_rate === 148.28);
  assert(hasFaaDay && hasFaaNight, 'Should seed proper FAA/PACT day and night rates');
  console.log('✔ DB and Seed Rates Verified.');

  // 2. Start Server
  console.log('\n[2/7] Starting Express API Server on Test Port 3001...');
  process.env.PORT = PORT;
  const app = require('./server.js');
  
  // Wait for server to start (it calls initDb and starts listening)
  await new Promise(resolve => setTimeout(resolve, 1500));
  console.log('✔ Server instance running.');

  // 3. Test Authentication API
  console.log('\n[3/7] Testing Auth signup & login endpoints...');
  const testEmail = `freelancer-${Date.now()}@test.com`;
  const testPassword = 'securepassword123';

  // Test Signup
  const signupRes = await makeRequest('POST', '/api/auth/signup', {
    email: testEmail,
    password: testPassword,
    default_commission_rate: 15.00,
    tax_year_start: '04-06'
  });
  
  assert(signupRes.status === 201, `Signup failed with status ${signupRes.status}`);
  assert(signupRes.body.token !== undefined, 'Signup response should return session token');
  const userToken = signupRes.body.token;
  const userId = signupRes.body.user.id;
  console.log(`- Registered user ID: ${userId}`);
  console.log(`- Session token generated successfully.`);

  // Test Login
  const loginRes = await makeRequest('POST', '/api/auth/login', {
    email: testEmail,
    password: testPassword
  });
  assert(loginRes.status === 200, `Login failed with status ${loginRes.status}`);
  assert(loginRes.body.token !== undefined, 'Login response should return token');
  console.log('✔ Auth Endpoints Verified.');

  // 4. Test CRUD Shifts & Dynamic Rate Integration
  console.log('\n[4/7] Testing Shift Creation & Dynamic Pay Calculations...');
  
  // Look up PACT/Equity Standard Day Rate
  const pactRate = rates.find(r => r.name === 'PACT/Equity Standard Day (Outside London)' && r.shift_type === 'Day');
  assert(pactRate !== undefined, 'Should find PACT/Equity Day rate');

  // Let's log a Booked shift using PACT rate
  // Shift from 08:00 to 19:00 (11 hours worked, so 2 hours Overtime)
  // Overtime rate: £9.53/hr, Holiday Pay Added: £13.81, Base: £114.39
  // Gross should be: 114.39 + (2 * 9.53) + 13.81 = 147.26
  // Commission @ 15%: 147.26 * 0.15 = 22.09
  // VAT: 0.00
  // Net: 147.26 - 22.09 = 125.17
  const grossCalc = pactRate.base_rate + (2 * pactRate.overtime_rate) + pactRate.holiday_pay;
  const commCalc = grossCalc * 0.15;
  const netCalc = grossCalc - commCalc;

  const newShiftRes = await makeRequest('POST', '/api/shifts', {
    project_name: 'Viking Series Shoot',
    status: 'Booked',
    shift_date: '2026-08-10',
    call_time: '08:00',
    wrap_time: '19:00',
    is_public_holiday: 0,
    is_night_shift: 0,
    gross_earnings: grossCalc,
    agency_commission: commCalc,
    vat: 0.00,
    net_earnings: netCalc,
    rate_id: pactRate.id
  }, userToken);

  assert(newShiftRes.status === 201, `Shift creation failed: ${newShiftRes.status}`);
  assert(newShiftRes.body.project_name === 'Viking Series Shoot', 'Project name mismatch');
  assert(newShiftRes.body.net_earnings === netCalc, 'Net earnings calculated value mismatch');
  console.log(`- Created shift Net: £${newShiftRes.body.net_earnings.toFixed(2)} (Gross: £${newShiftRes.body.gross_earnings.toFixed(2)})`);

  // Create another Paid shift manually (flat rate)
  await makeRequest('POST', '/api/shifts', {
    project_name: 'Direct Modeling Gig',
    status: 'Paid',
    shift_date: '2026-08-15',
    gross_earnings: 200.00,
    agency_commission: 20.00,
    vat: 0.00,
    net_earnings: 180.00
  }, userToken);

  // Retrieve Shifts
  const getShiftsRes = await makeRequest('GET', '/api/shifts', null, userToken);
  assert(getShiftsRes.status === 200, 'Failed to fetch shifts');
  assert(getShiftsRes.body.length === 2, 'Should have exactly 2 shifts logged');
  console.log(`- Fetched shifts count: ${getShiftsRes.body.length}`);
  console.log('✔ Shift CRUD & Calculations Verified.');

  // 5. Test Expenses, Feedback, and Exporter
  console.log('\n[5/7] Testing Expenses, User Feedback, and Tax Exporter...');
  
  // Log expense
  const expRes = await makeRequest('POST', '/api/expenses', {
    category: 'Travel Allowance',
    amount: 32.50,
    date_incurred: '2026-08-12'
  }, userToken);
  assert(expRes.status === 201, 'Expense logging failed');
  console.log(`- Expense logged: £${expRes.body.amount.toFixed(2)} under ${expRes.body.category}`);

  // Submit Feedback
  const feedRes = await makeRequest('POST', '/api/feedback', {
    subject: 'Timesheet Bug',
    message: 'Selected date indicator is not displaying red on unavailability'
  }, userToken);
  assert(feedRes.status === 201, 'Feedback logging failed');
  console.log('✔ Feedback logged.');

  // Run Tax Exporter
  const taxExpRes = await makeRequest('GET', '/api/dashboard/tax-summary?start_date=2026-08-01&end_date=2026-08-31', null, userToken);
  assert(taxExpRes.status === 200, 'Tax summary exporter failed');
  assert(taxExpRes.body.gross === (grossCalc + 200.00), 'Gross mismatch in tax exporter');
  assert(taxExpRes.body.expenses === 32.50, 'Expenses mismatch in tax exporter');
  console.log(`- Tax Exporter Gross: £${taxExpRes.body.gross.toFixed(2)}, Expenses: £${taxExpRes.body.expenses.toFixed(2)}, Net Profit: £${taxExpRes.body.netProfit.toFixed(2)}`);
  console.log('✔ Expenses, Feedback, and Exporter Verified.');

  // 6. Test Admin Panel (using seeded admin credentials)
  console.log('\n[6/7] Testing Admin Panel Analytics & Stats...');
  
  // Login as admin
  const adminLoginRes = await makeRequest('POST', '/api/auth/login', {
    email: 'admin@setsum.co.uk',
    password: 'admin123'
  });
  assert(adminLoginRes.status === 200, 'Admin login failed');
  const adminToken = adminLoginRes.body.token;

  // Retrieve Admin stats
  const adminStatsRes = await makeRequest('GET', '/api/admin/stats', null, adminToken);
  assert(adminStatsRes.status === 200, 'Failed to fetch admin stats');
  assert(adminStatsRes.body.stats.totalUsers >= 2, 'Should track registered users');
  console.log(`- Admin Stats: Total Users: ${adminStatsRes.body.stats.totalUsers}, Active Today (DAU): ${adminStatsRes.body.stats.dailyActiveUsers}`);

  // Retrieve complaints
  const adminFeedbackRes = await makeRequest('GET', '/api/admin/feedback', null, adminToken);
  assert(adminFeedbackRes.status === 200, 'Failed to fetch feedback logs');
  assert(adminFeedbackRes.body.length >= 1, 'Should find the feedback ticket logged in Step 5');
  console.log(`- Admin Complaints Ticket Count: ${adminFeedbackRes.body.length}`);
  console.log('✔ Admin Controls & Analytics Verified.');

  // 7. Programmatic verification of MCP tools
  console.log('\n[7/7] Verifying MCP Tools functions...');
  const mcp = require('../mcp/mcp-server.js');
  
  // We can directly mock call tool logic defined in mcp-server.js by importing it or checking its definitions
  // Verify TOOLS array metadata exists
  const mcpProcess = require('child_process');
  
  // We'll test it programmatically by running the executeTool logic or running the module tools
  console.log('- Checking MCP tools schemas definition...');
  const child = mcpProcess.spawn('node', [require('path').join(__dirname, '../mcp/mcp-server.js')]);
  
  // Write initialize and check response
  const initPayload = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test-client', version: '1.0' } }
  }) + '\n';
  
  const toolsListPayload = JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list'
  }) + '\n';

  let responseData = '';
  child.stdout.on('data', (data) => {
    responseData += data.toString();
  });

  child.stdin.write(initPayload);
  child.stdin.write(toolsListPayload);
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  child.kill();

  assert(responseData.includes('protocolVersion'), 'MCP initialize response missing standard protocol fields');
  assert(responseData.includes('log_new_shift') && responseData.includes('get_pending_payments'), 'MCP list response missing registered tools list');
  console.log('✔ MCP Handshake and Tool Listing Verified.');

  console.log('\n==================================================');
  console.log('ALL TESTS PASSED SUCCESSFULLY! SETSUM CORE READY!');
  console.log('==================================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err.message);
  process.exit(1);
});
