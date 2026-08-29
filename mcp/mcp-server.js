const fs = require('fs');
const crypto = require('crypto');
const db = require('../server/db');

// Logging utility to stderr so it doesn't pollute stdout (which is used for JSON-RPC)
function logError(msg) {
  process.stderr.write(`[MCP Error] ${msg}\n`);
}

// Helper to get default user ID (creating one if db is empty)
async function getDefaultUserId() {
  await db.initDb();
  let user = await db.get('SELECT id, default_commission_rate FROM users ORDER BY created_at ASC LIMIT 1');
  if (!user) {
    const defaultId = crypto.randomUUID();
    const passwordHash = crypto.createHash('sha256').update('localuser123').digest('hex');
    await db.run(
      'INSERT INTO users (id, email, password_hash, role, default_commission_rate) VALUES (?, ?, ?, ?, ?)',
      [defaultId, 'user@setsum.co.uk', passwordHash, 'user', 20.00]
    );
    user = { id: defaultId, default_commission_rate: 20.00 };
  }
  return user;
}

// Expose tools metadata
const TOOLS = [
  {
    name: 'log_new_shift',
    description: 'Logs a new shift record for the user. Automatically calculates net earnings based on user commission.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: { type: 'string', description: 'Name of the gig/show/project' },
        shift_date: { type: 'string', description: 'Date of the shift in YYYY-MM-DD format' },
        status: { type: 'string', enum: ['Unavailable', 'Pencilled', 'Booked', 'Paid'], description: 'Current status of the shift' },
        gross_earnings: { type: 'number', description: 'Gross pay amount in GBP' },
        agency_name: { type: 'string', description: 'Optional name of the booking agency' }
      },
      required: ['project_name', 'shift_date', 'status', 'gross_earnings']
    }
  },
  {
    name: 'get_pending_payments',
    description: 'Queries the shifts table for all records where status is not "Paid". Returns pending jobs and outstanding net earnings.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'Optional user UUID filter. If omitted, uses default user.' }
      }
    }
  },
  {
    name: 'log_expense',
    description: 'Inserts a new record into the expenses table.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Category of the expense (e.g. Travel, Meals, Costume)' },
        amount: { type: 'number', description: 'Amount of the expense in GBP' },
        date_incurred: { type: 'string', description: 'Date when the expense was incurred in YYYY-MM-DD format' }
      },
      required: ['category', 'amount', 'date_incurred']
    }
  },
  {
    name: 'generate_tax_summary',
    description: 'Aggregates shifts and expenses data between two dates. Returns total gross, expenses, commissions, VAT, and net profit.',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
        end_date: { type: 'string', description: 'End date in YYYY-MM-DD format' }
      },
      required: ['start_date', 'end_date']
    }
  }
];

// Handles executing tools
async function executeTool(name, args) {
  const user = await getDefaultUserId();
  const userId = user.id;

  switch (name) {
    case 'log_new_shift': {
      const { project_name, shift_date, status, gross_earnings, agency_name } = args;

      let agencyId = null;
      if (agency_name) {
        const agencyNameTrimmed = agency_name.trim();
        let agency = await db.get('SELECT id FROM agencies WHERE user_id = ? AND name = ?', [userId, agencyNameTrimmed]);
        if (!agency) {
          agencyId = crypto.randomUUID();
          await db.run('INSERT INTO agencies (id, user_id, name) VALUES (?, ?, ?)', [agencyId, userId, agencyNameTrimmed]);
        } else {
          agencyId = agency.id;
        }
      }

      const gross = parseFloat(gross_earnings) || 0.00;
      const commRate = user.default_commission_rate || 20.00;
      const commission = gross * (commRate / 100);
      const vat = 0.00;
      const net = gross - commission - vat;

      const shiftId = crypto.randomUUID();
      await db.run(
        `INSERT INTO shifts (
          id, user_id, agency_id, project_name, status, shift_date,
          gross_earnings, agency_commission, vat, net_earnings
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [shiftId, userId, agencyId, project_name, status, shift_date, gross, commission, vat, net]
      );

      return {
        message: `Successfully logged shift "${project_name}" for ${shift_date}`,
        shift: {
          id: shiftId,
          project_name,
          shift_date,
          status,
          gross_earnings: gross,
          agency_commission: commission,
          net_earnings: net
        }
      };
    }

    case 'get_pending_payments': {
      const targetUserId = args.user_id || userId;
      const shifts = await db.all(
        `SELECT s.id, s.shift_date, s.project_name, s.net_earnings, a.name as agency_name 
         FROM shifts s 
         LEFT JOIN agencies a ON s.agency_id = a.id
         WHERE s.user_id = ? AND s.status != 'Paid'
         ORDER BY s.shift_date ASC`,
        [targetUserId]
      );

      const totalOutstanding = shifts.reduce((sum, s) => sum + s.net_earnings, 0);

      return {
        total_outstanding_net: totalOutstanding,
        pending_jobs_count: shifts.length,
        pending_jobs: shifts.map(s => ({
          date: s.shift_date,
          project: s.project_name,
          agency: s.agency_name || 'Direct',
          net_earnings: s.net_earnings
        }))
      };
    }

    case 'log_expense': {
      const { category, amount, date_incurred } = args;
      const expenseId = crypto.randomUUID();
      const parsedAmount = parseFloat(amount) || 0.00;

      await db.run(
        `INSERT INTO expenses (id, user_id, category, amount, date_incurred)
         VALUES (?, ?, ?, ?, ?)`,
        [expenseId, userId, category, parsedAmount, date_incurred]
      );

      return {
        message: `Successfully logged expense of £${parsedAmount.toFixed(2)} under category "${category}"`,
        expense: {
          id: expenseId,
          category,
          amount: parsedAmount,
          date_incurred
        }
      };
    }

    case 'generate_tax_summary': {
      const { start_date, end_date } = args;

      // Shifts in range
      const shiftsStats = await db.get(
        `SELECT SUM(gross_earnings) as gross, SUM(agency_commission) as comm, SUM(vat) as vat 
         FROM shifts 
         WHERE user_id = ? AND shift_date >= ? AND shift_date <= ?`,
        [userId, start_date, end_date]
      );

      // Expenses in range
      const expensesStats = await db.get(
        `SELECT SUM(amount) as expenses 
         FROM expenses 
         WHERE user_id = ? AND date_incurred >= ? AND date_incurred <= ?`,
        [userId, start_date, end_date]
      );

      const gross = shiftsStats.gross || 0;
      const comm = shiftsStats.comm || 0;
      const vat = shiftsStats.vat || 0;
      const expenses = expensesStats.expenses || 0;
      const netProfit = gross - expenses - comm - vat;

      return {
        date_range: { start: start_date, end: end_date },
        totals: {
          gross_earnings: gross,
          expenses: expenses,
          commissions: comm,
          vat: vat,
          net_profit: netProfit
        }
      };
    }

    default:
      throw new Error(`Tool "${name}" not found`);
  }
}

// JSON-RPC input parsing logic from stdin
let buffer = '';
process.stdin.on('data', async (chunk) => {
  buffer += chunk.toString();
  let lineEndIndex;

  while ((lineEndIndex = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, lineEndIndex).trim();
    buffer = buffer.slice(lineEndIndex + 1);

    if (line) {
      try {
        const request = JSON.parse(line);
        const response = await handleJsonRpc(request);
        if (response) {
          process.stdout.write(JSON.stringify(response) + '\n');
        }
      } catch (err) {
        logError(`Failed to process message: ${err.message}`);
        // Send basic error back
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32700, message: 'Parse error' },
          id: null
        }) + '\n');
      }
    }
  }
});

// JSON-RPC routing
async function handleJsonRpc(request) {
  const { jsonrpc, id, method, params } = request;

  if (jsonrpc !== '2.0') {
    return {
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Invalid Request' },
      id: id || null
    };
  }

  // Handle initialization handshake
  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'setsum-mcp-server',
          version: '1.0.0'
        }
      },
      id
    };
  }

  // List tools
  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      result: {
        tools: TOOLS
      },
      id
    };
  }

  // Call tool
  if (method === 'tools/call') {
    const { name, arguments: args } = params || {};
    try {
      const toolResult = await executeTool(name, args);
      return {
        jsonrpc: '2.0',
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(toolResult, null, 2)
            }
          ]
        },
        id
      };
    } catch (err) {
      logError(`Error calling tool "${name}": ${err.message}`);
      return {
        jsonrpc: '2.0',
        error: { code: -32603, message: err.message },
        id
      };
    }
  }

  // Standard Ping/Notification or unsupported methods
  if (id !== undefined) {
    return {
      jsonrpc: '2.0',
      error: { code: -32601, message: `Method not found: ${method}` },
      id
    };
  }

  return null;
}

// Ensure database is initialized on startup
db.initDb().then(() => {
  process.stderr.write('[SetSum MCP Server] Started and listening on stdin...\n');
}).catch(err => {
  logError(`Database initialization failed: ${err.message}`);
  process.exit(1);
});
