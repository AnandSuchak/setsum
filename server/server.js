const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// Request logger middleware
app.use((req, res, next) => {
  console.log(`[Server Log] ${req.method} ${req.url}`);
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, '../web')));

// Middleware to authenticate user session
async function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Session token required' });
  }

  try {
    const session = await db.get(
      `SELECT s.*, u.email, u.role, u.default_commission_rate, u.tax_year_start 
       FROM user_sessions s 
       JOIN users u ON s.user_id = u.id 
       WHERE s.id = ?`,
      [token]
    );

    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    req.user = {
      id: session.user_id,
      email: session.email,
      role: session.role,
      default_commission_rate: session.default_commission_rate,
      tax_year_start: session.tax_year_start,
    };

    // 5-Minute Inactivity Session Expiration Check
    try {
      const now = Date.now();
      const FIVE_MINUTES_MS = 5 * 60 * 1000;
      if (session.last_active_time && (now - Number(session.last_active_time)) > FIVE_MINUTES_MS) {
        await db.run('DELETE FROM user_sessions WHERE id = ?', [token]);
        return res.status(401).json({ error: 'Session expired due to 5 minutes of inactivity' });
      }

      // Track active usage & update last_active_time timestamp
      const today = new Date().toISOString().split('T')[0];
      await db.run(
        'UPDATE user_sessions SET last_active_date = ?, last_active_time = ? WHERE id = ?',
        [today, String(now), token]
      );
    } catch (sessionCheckErr) {
      console.warn('[Session Expiration Check Warning]:', sessionCheckErr.message);
    }

    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error during authentication' });
  }
}

// Middleware for admin verification
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Admin role required' });
  }
  next();
}

// Simple in-memory login brute-force rate limiter (SaaS cybersecurity best practice)
const loginAttempts = {};

function checkLoginRateLimit(email) {
  const record = loginAttempts[email];
  if (!record) return { isLocked: false };
  const now = Date.now();
  if (record.lockUntil > now) {
    const minutesLeft = Math.ceil((record.lockUntil - now) / 60000);
    return { isLocked: true, minutesLeft };
  }
  // Reset if time elapsed
  if (record.lockUntil > 0 && record.lockUntil <= now) {
    delete loginAttempts[email];
  }
  return { isLocked: false };
}

function recordFailedLogin(email) {
  if (!loginAttempts[email]) {
    loginAttempts[email] = { count: 0, lockUntil: 0 };
  }
  const record = loginAttempts[email];
  record.count++;
  if (record.count >= 5) {
    record.lockUntil = Date.now() + 15 * 60 * 1000; // 15-minute lock
    record.count = 0;
  }
}

function clearFailedLogins(email) {
  delete loginAttempts[email];
}

// --- AUTHENTICATION ENDPOINTS ---

// Register
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, default_commission_rate, tax_year_start } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const existing = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const userId = crypto.randomUUID();
    const passwordHash = db.hashPassword(password);
    const commRate = default_commission_rate !== undefined ? default_commission_rate : 20.00;
    const taxStart = tax_year_start || '04-06';

    await db.run(
      `INSERT INTO users (id, email, password_hash, default_commission_rate, tax_year_start, role)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, email, passwordHash, commRate, taxStart, 'user']
    );

    // Create session token
    const sessionId = crypto.randomUUID();
    const today = new Date().toISOString().split('T')[0];
    await db.run(
      `INSERT INTO user_sessions (id, user_id, last_active_date) VALUES (?, ?, ?)`,
      [sessionId, userId, today]
    );

    res.status(201).json({
      token: sessionId,
      user: { id: userId, email, role: 'user', default_commission_rate: commRate }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during sign up' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  // Cyber security check: Rate Limiting
  const rateLimit = checkLoginRateLimit(email);
  if (rateLimit.isLocked) {
    return res.status(429).json({ error: `Too many failed attempts. Account locked. Try again in ${rateLimit.minutesLeft} minutes.` });
  }

  try {
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      recordFailedLogin(email);
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    if (!db.verifyPassword(password, user.password_hash)) {
      recordFailedLogin(email);
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Success: clear lock tracking
    clearFailedLogins(email);

    // Create session token
    const sessionId = crypto.randomUUID();
    const today = new Date().toISOString().split('T')[0];
    await db.run(
      `INSERT INTO user_sessions (id, user_id, last_active_date) VALUES (?, ?, ?)`,
      [sessionId, user.id, today]
    );

    res.json({
      token: sessionId,
      user: { id: user.id, email: user.email, role: user.role, default_commission_rate: user.default_commission_rate }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Get current user info
app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// Logout endpoint (destroys active user session)
app.post('/api/auth/logout', authenticate, async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const sessionToken = authHeader && authHeader.split(' ')[1];
    if (sessionToken) {
      await db.run('DELETE FROM user_sessions WHERE id = ?', [sessionToken]);
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during logout' });
  }
});

// AI Chat Endpoint with Gemini Function Calling (Voice/Text)
app.post('/api/chat', authenticate, async (req, res) => {
  const { message } = req.body;
  const userId = req.user.id;

  if (!message) {
    return res.status(400).json({ error: 'Message query is required' });
  }

  // Safety fallback if API key is not configured in environment
  if (!process.env.GEMINI_API_KEY) {
    return res.json({
      reply: "⚠️ The GEMINI_API_KEY environment variable is not configured. Please add it to your Vercel Project Settings to activate the AI Chat Assistant!",
      refreshRequired: false
    });
  }

  try {
    const systemPrompt = `You are the SetSum AI Assistant, a helpful and professional companion for the SetSum freelance tracking SaaS platform. You help freelancers log shifts, track business expenses, audit outstanding payouts, and compute tax totals. You are talking to user ID: ${userId} (Email: ${req.user.email}).

You have access to database tools. Use them to help the user query or update their shifts and expenses.
* When asked to log a shift, call the 'log_new_shift' tool. Default status is 'Booked' if not specified. Convert inputs to numbers and formatted dates.
* When asked to log an expense, call the 'log_expense' tool. Convert category and amount.
* When asked to audit pending payouts, call the 'get_pending_payments' tool.
* When asked about earnings, profits, or taxes, call the 'generate_tax_summary' tool.

Always communicate politely. Respond concisely and format currency figures clearly in British Pounds (e.g. £125.50).`;

    // Define tools
    const tools = [
      {
        functionDeclarations: [
          {
            name: "get_pending_payments",
            description: "Queries the database for pending/unpaid shifts and total net earnings outstanding."
          },
          {
            name: "log_expense",
            description: "Logs a business expense. All parameters are required.",
            parameters: {
              type: "OBJECT",
              properties: {
                category: { type: "STRING", description: "Expense category (e.g. Travel, Meals, Wardrobe, Gear)" },
                amount: { type: "NUMBER", description: "Decimal amount spent" },
                date_incurred: { type: "STRING", description: "The date of the expense (format YYYY-MM-DD)" }
              },
              required: ["category", "amount", "date_incurred"]
            }
          },
          {
            name: "log_new_shift",
            description: "Logs a new shift. Automatically calculates net pay using user commission rate.",
            parameters: {
              type: "OBJECT",
              properties: {
                project_name: { type: "STRING", description: "Name of the shoot or booking" },
                shift_date: { type: "STRING", description: "Date of the shift (format YYYY-MM-DD)" },
                status: { type: "STRING", description: "Status: Pencilled, Booked, Paid, or Unavailable" },
                gross_earnings: { type: "NUMBER", description: "Gross daily base payment rate" },
                agency_name: { type: "STRING", description: "Optional name of the casting agency" }
              },
              required: ["project_name", "shift_date", "status", "gross_earnings"]
            }
          },
          {
            name: "generate_tax_summary",
            description: "Generates aggregated gross earnings, total expenses, and final net profit for a date range.",
            parameters: {
              type: "OBJECT",
              properties: {
                start_date: { type: "STRING", description: "Start date of date range (format YYYY-MM-DD)" },
                end_date: { type: "STRING", description: "End date of date range (format YYYY-MM-DD)" }
              },
              required: ["start_date", "end_date"]
            }
          }
        ]
      }
    ];

    // Helper to send request to Gemini REST API (supports legacy AIzaSy keys & new AQ... Auth keys)
    async function callGemini(contents) {
      const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
      const isLegacyKey = apiKey.startsWith('AIzaSy');
      
      const url = isLegacyKey 
        ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`
        : `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`;

      const headers = {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
        'Authorization': `Bearer ${apiKey}`
      };

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          tools
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API returned error ${response.status}: ${errorText}`);
      }

      return await response.json();
    }

    // Initialize conversation contents
    const contents = [
      {
        role: "user",
        parts: [{ text: message }]
      }
    ];

    // 1. Call Gemini
    const geminiRes = await callGemini(contents);
    const candidate = geminiRes.candidates?.[0];
    const modelContent = candidate?.content;
    const parts = modelContent?.parts || [];
    const functionCall = parts.find(p => p.functionCall)?.functionCall;

    let refreshRequired = false;

    // 2. Intercept and execute Function Call if requested
    if (functionCall) {
      const { name, args } = functionCall;
      let toolResult = null;

      try {
        if (name === "get_pending_payments") {
          const pending = await db.all(
            'SELECT project_name, shift_date, status, net_earnings FROM shifts WHERE user_id = ? AND status != ? ORDER BY shift_date ASC',
            [userId, 'Paid']
          );
          const totalOutstanding = pending.reduce((sum, s) => sum + parseFloat(s.net_earnings), 0);
          toolResult = {
            pending_shifts_count: pending.length,
            total_outstanding_net: totalOutstanding,
            items: pending.map(s => ({
              project_name: s.project_name,
              date: s.shift_date,
              status: s.status,
              net_earnings: s.net_earnings
            }))
          };
        } 
        else if (name === "log_expense") {
          const expenseId = crypto.randomUUID();
          await db.run(
            'INSERT INTO expenses (id, user_id, category, amount, date_incurred) VALUES (?, ?, ?, ?, ?)',
            [expenseId, userId, args.category, args.amount, args.date_incurred]
          );
          toolResult = {
            success: true,
            message: "Expense logged successfully",
            expense_id: expenseId,
            category: args.category,
            amount: args.amount,
            date: args.date_incurred
          };
          refreshRequired = true;
        } 
        else if (name === "log_new_shift") {
          // Resolve agency
          let agency_id = null;
          if (args.agency_name) {
            const existing = await db.get('SELECT id FROM agencies WHERE name = ?', [args.agency_name]);
            if (existing) {
              agency_id = existing.id;
            } else {
              agency_id = crypto.randomUUID();
              await db.run('INSERT INTO agencies (id, name, user_id) VALUES (?, ?, ?)', [agency_id, args.agency_name, userId]);
            }
          }

          // Calculate commission & net earnings
          const user = await db.get('SELECT default_commission_rate FROM users WHERE id = ?', [userId]);
          const commPct = user && user.default_commission_rate !== undefined ? user.default_commission_rate : 20.00;
          const commission = args.gross_earnings * (commPct / 100);
          const net = args.gross_earnings - commission;

          const shiftId = crypto.randomUUID();
          await db.run(
            `INSERT INTO shifts (id, user_id, project_name, status, shift_date, gross_earnings, agency_commission, net_earnings, agency_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [shiftId, userId, args.project_name, args.status, args.shift_date, args.gross_earnings, commission, net, agency_id]
          );

          toolResult = {
            success: true,
            message: "Shift logged successfully",
            shift_id: shiftId,
            project_name: args.project_name,
            status: args.status,
            date: args.shift_date,
            gross: args.gross_earnings,
            commission: commission,
            net: net
          };
          refreshRequired = true;
        } 
        else if (name === "generate_tax_summary") {
          const shifts = await db.all(
            'SELECT gross_earnings, agency_commission, vat, net_earnings FROM shifts WHERE user_id = ? AND shift_date >= ? AND shift_date <= ?',
            [userId, args.start_date, args.end_date]
          );
          const expenses = await db.all(
            'SELECT amount FROM expenses WHERE user_id = ? AND date_incurred >= ? AND date_incurred <= ?',
            [userId, args.start_date, args.end_date]
          );

          const gross = shifts.reduce((sum, s) => sum + parseFloat(s.gross_earnings), 0);
          const comm = shifts.reduce((sum, s) => sum + parseFloat(s.agency_commission), 0);
          const vatVal = shifts.reduce((sum, s) => sum + parseFloat(s.vat), 0);
          const netEarnings = shifts.reduce((sum, s) => sum + parseFloat(s.net_earnings), 0);
          const totalExp = expenses.reduce((sum, s) => sum + parseFloat(s.amount), 0);
          const netProfit = netEarnings - totalExp;

          toolResult = {
            start_date: args.start_date,
            end_date: args.end_date,
            gross_earnings: gross,
            agency_commissions: comm,
            vat_paid: vatVal,
            total_expenses: totalExp,
            net_profit: netProfit,
            shifts_count: shifts.length,
            expenses_count: expenses.length
          };
        }
      } catch (dbErr) {
        console.error('[AI Assistant] Tool Database Execution Error:', dbErr);
        toolResult = { error: dbErr.message };
      }

      // Add Model's decision and the Tool's result to the conversational history
      contents.push(modelContent);
      contents.push({
        role: "function",
        parts: [
          {
            functionResponse: {
              name,
              response: toolResult
            }
          }
        ]
      });

      // 3. Make second request to Gemini to get the conversational response
      const followUpRes = await callGemini(contents);
      const finalReply = followUpRes.candidates?.[0]?.content?.parts?.[0]?.text || "I have processed the request.";
      return res.json({ reply: finalReply, refreshRequired });
    }

    // If Gemini didn't call a function, just return its text answer
    const directReply = parts.find(p => p.text)?.text || "I'm sorry, I couldn't process that request.";
    res.json({ reply: directReply, refreshRequired: false });

  } catch (err) {
    console.error('[AI Assistant Error]:', err);
    try {
      const fallback = await smartLocalFallback(message, userId);
      return res.json(fallback);
    } catch (fbErr) {
      return res.json({
        reply: `Hello! I am your SetSum AI Assistant. You can ask me to log shifts, record expenses, view pending payments, or calculate taxes!`,
        refreshRequired: false
      });
    }
  }
});

// Smart Offline/Fallback AI Assistant Processor
async function smartLocalFallback(message, userId) {
  const lower = message.toLowerCase();

  // 1. Pending Payments
  if (lower.includes('pending') || lower.includes('unpaid') || lower.includes('due') || lower.includes('owes') || lower.includes('payout')) {
    const pending = await db.all(
      'SELECT project_name, shift_date, status, net_earnings FROM shifts WHERE user_id = ? AND status != ? ORDER BY shift_date ASC',
      [userId, 'Paid']
    );
    const total = pending.reduce((sum, s) => sum + parseFloat(s.net_earnings), 0);
    if (pending.length === 0) {
      return { reply: "You currently have no pending payments! All your logged shifts are fully paid.", refreshRequired: false };
    }
    const itemsText = pending.map(s => `• ${s.project_name} (${s.shift_date}): £${parseFloat(s.net_earnings).toFixed(2)} [${s.status}]`).join('\n');
    return {
      reply: `You have ${pending.length} pending shift(s) awaiting payment totaling £${total.toFixed(2)}:\n\n${itemsText}`,
      refreshRequired: false
    };
  }

  // 2. Log Shift Intent Recognition & Natural Language Time/Date Parsing
  const isShiftIntent = lower.includes('shift') || 
                        lower.includes('shoot') || 
                        lower.includes('booking') || 
                        lower.includes('log') || 
                        lower.includes('create') || 
                        lower.includes('add') || 
                        lower.includes('new') || 
                        lower.includes('tomorrow') || 
                        lower.includes('today') || 
                        lower.includes('pencilled') || 
                        lower.includes('booked') || 
                        lower.includes('work') || 
                        lower.includes('pm') || 
                        lower.includes('am') || 
                        lower.includes('to');

  if (isShiftIntent && !lower.includes('expense') && !lower.includes('spent') && !lower.includes('pending') && !lower.includes('tax')) {
    // Resolve Date (Tomorrow vs Today vs Specific date)
    let shiftDate = new Date().toISOString().split('T')[0];
    if (lower.includes('tomorrow')) {
      const tmrw = new Date();
      tmrw.setDate(tmrw.getDate() + 1);
      shiftDate = tmrw.toISOString().split('T')[0];
    }

    // Resolve Numbers / Pay
    const numbers = message.match(/\d+(\.\d+)?/g);
    let gross = 150.00;
    if (numbers && numbers.length > 0) {
      const payMatch = numbers.find(n => parseFloat(n) >= 20 && parseFloat(n) <= 5000);
      if (payMatch) gross = parseFloat(payMatch);
    }

    // Resolve Times (e.g. "3 to 5:00 PM", "09:00 to 17:00")
    let callTime = '09:00';
    let wrapTime = '17:00';
    const timeMatch = lower.match(/(\d{1,2}(:\d{2})?)\s*(am|pm)?\s*(to|-)\s*(\d{1,2}(:\d{2})?)\s*(am|pm)?/);
    if (timeMatch) {
      const [, start, , startAmpm, , end, , endAmpm] = timeMatch;
      let startH = parseInt(start.split(':')[0], 10);
      let endH = parseInt(end.split(':')[0], 10);
      
      const isPm = lower.includes('pm') || (endAmpm === 'pm');
      if (isPm && startH < 12) startH += 12;
      if (isPm && endH < 12) endH += 12;

      callTime = `${String(startH).padStart(2, '0')}:${start.includes(':') ? start.split(':')[1] : '00'}`;
      wrapTime = `${String(endH).padStart(2, '0')}:${end.includes(':') ? end.split(':')[1] : '00'}`;
    }

    // Clean project name
    let projectName = message
      .replace(/log|logged|ged|create|add|new|for|shift|shoot|booking|pencilled|booked|gross|pay|£|\$|tomorrow|today|from|to|am|pm|\d{1,2}(:\d{2})?/gi, '')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .trim();
    if (!projectName || projectName.length < 2 || projectName.toLowerCase() === 'a ged' || projectName.toLowerCase() === 'a ged for') {
      projectName = 'Freelance Booking';
    }

    const user = await db.get('SELECT default_commission_rate FROM users WHERE id = ?', [userId]);
    const commPct = user && user.default_commission_rate !== undefined ? user.default_commission_rate : 20.00;
    const comm = gross * (commPct / 100);
    const net = gross - comm;

    const shiftId = crypto.randomUUID();
    await db.run(
      `INSERT INTO shifts (id, user_id, project_name, status, shift_date, call_time, wrap_time, gross_earnings, agency_commission, net_earnings)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [shiftId, userId, projectName, 'Booked', shiftDate, callTime, wrapTime, gross, comm, net]
    );

    return {
      reply: `Logged new shift "${projectName}" for ${shiftDate} (${callTime} - ${wrapTime})!\n• Gross: £${gross.toFixed(2)}\n• Net (after ${commPct}% comm): £${net.toFixed(2)}`,
      refreshRequired: true,
      targetDate: shiftDate
    };
  }

  // 3. Log Expense (e.g. "log expense travel 25")
  if (lower.includes('expense') || lower.includes('spent') || lower.includes('bought')) {
    const numbers = message.match(/\d+(\.\d+)?/g);
    const amount = numbers ? parseFloat(numbers[0]) : 10;
    const today = new Date().toISOString().split('T')[0];
    const category = lower.includes('travel') ? 'Travel' : lower.includes('meal') ? 'Meals' : lower.includes('gear') ? 'Equipment' : 'General Business Expense';

    const expenseId = crypto.randomUUID();
    await db.run(
      'INSERT INTO expenses (id, user_id, category, amount, date_incurred) VALUES (?, ?, ?, ?, ?)',
      [expenseId, userId, category, amount, today]
    );

    return {
      reply: `Logged business expense under "${category}" for £${amount.toFixed(2)} on ${today}.`,
      refreshRequired: true
    };
  }

  // 4. Tax Summary
  if (lower.includes('tax') || lower.includes('summary') || lower.includes('profit') || lower.includes('earned')) {
    const todayStr = new Date().toISOString().split('T')[0];
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const shifts = await db.all(
      'SELECT gross_earnings, agency_commission, net_earnings FROM shifts WHERE user_id = ? AND shift_date >= ? AND shift_date <= ?',
      [userId, yearStart, todayStr]
    );
    const expenses = await db.all(
      'SELECT amount FROM expenses WHERE user_id = ? AND date_incurred >= ? AND date_incurred <= ?',
      [userId, yearStart, todayStr]
    );

    const gross = shifts.reduce((sum, s) => sum + parseFloat(s.gross_earnings), 0);
    const netEarnings = shifts.reduce((sum, s) => sum + parseFloat(s.net_earnings), 0);
    const totalExp = expenses.reduce((sum, s) => sum + parseFloat(s.amount), 0);
    const netProfit = netEarnings - totalExp;

    return {
      reply: `Financial Summary (Year to Date):\n• Gross Earnings: £${gross.toFixed(2)}\n• Expenses Deducted: £${totalExp.toFixed(2)}\n• Net Profit: £${netProfit.toFixed(2)}`,
      refreshRequired: false
    };
  }

  return {
    reply: "Hello! I am your SetSum AI Assistant. You can ask me to:\n• Check pending payments\n• Log a shift (e.g. 'log shift Commercial Shoot £250')\n• Log an expense (e.g. 'log expense Travel £15')\n• Compute your tax summary",
    refreshRequired: false
  };
}

// --- PAY RATES ENDPOINTS ---

app.get('/api/rates', async (req, res) => {
  try {
    const rates = await db.all('SELECT * FROM pay_rates ORDER BY name, shift_type');
    res.json(rates);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch pay rates' });
  }
});

// --- AGENCIES ENDPOINTS ---

app.get('/api/agencies', authenticate, async (req, res) => {
  try {
    const agencies = await db.all('SELECT * FROM agencies WHERE user_id = ? ORDER BY name', [req.user.id]);
    res.json(agencies);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch agencies' });
  }
});

app.post('/api/agencies', authenticate, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Agency name is required' });
  }

  try {
    const nameTrimmed = name.trim();
    // Check if duplicate
    const existing = await db.get('SELECT * FROM agencies WHERE user_id = ? AND name = ?', [req.user.id, nameTrimmed]);
    if (existing) {
      return res.json(existing);
    }

    const agencyId = crypto.randomUUID();
    await db.run(
      'INSERT INTO agencies (id, user_id, name) VALUES (?, ?, ?)',
      [agencyId, req.user.id, nameTrimmed]
    );
    res.status(201).json({ id: agencyId, user_id: req.user.id, name: nameTrimmed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create agency' });
  }
});

// --- SHIFTS ENDPOINTS ---

app.get('/api/shifts', authenticate, async (req, res) => {
  const { status } = req.query;
  try {
    let sql = 'SELECT s.*, a.name as agency_name FROM shifts s LEFT JOIN agencies a ON s.agency_id = a.id WHERE s.user_id = ?';
    const params = [req.user.id];

    if (status) {
      sql += ' AND s.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY s.shift_date DESC, s.call_time DESC';
    const shifts = await db.all(sql, params);
    res.json(shifts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch shifts' });
  }
});

app.post('/api/shifts', authenticate, async (req, res) => {
  const {
    project_name, status, shift_date, call_time, wrap_time,
    is_public_holiday, is_night_shift, gross_earnings,
    agency_commission, vat, net_earnings, expected_payment_date,
    notes, agency_id, rate_id
  } = req.body;

  if (!project_name || !status || !shift_date) {
    return res.status(400).json({ error: 'Project name, status, and shift date are required' });
  }

  try {
    const shiftId = crypto.randomUUID();
    const gEarn = parseFloat(gross_earnings) || 0.00;
    const comm = parseFloat(agency_commission) || 0.00;
    const v = parseFloat(vat) || 0.00;
    const net = parseFloat(net_earnings) || 0.00;

    await db.run(
      `INSERT INTO shifts (
        id, user_id, agency_id, rate_id, project_name, status, shift_date,
        call_time, wrap_time, is_public_holiday, is_night_shift,
        gross_earnings, agency_commission, vat, net_earnings,
        expected_payment_date, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        shiftId, req.user.id, agency_id || null, rate_id || null, project_name, status, shift_date,
        call_time || null, wrap_time || null, is_public_holiday ? 1 : 0, is_night_shift ? 1 : 0,
        gEarn, comm, v, net, expected_payment_date || null, notes || null
      ]
    );

    const created = await db.get(
      'SELECT s.*, a.name as agency_name FROM shifts s LEFT JOIN agencies a ON s.agency_id = a.id WHERE s.id = ?',
      [shiftId]
    );
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to log shift' });
  }
});

app.put('/api/shifts/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const {
    project_name, status, shift_date, call_time, wrap_time,
    is_public_holiday, is_night_shift, gross_earnings,
    agency_commission, vat, net_earnings, expected_payment_date,
    notes, agency_id, rate_id
  } = req.body;

  if (!project_name || !status || !shift_date) {
    return res.status(400).json({ error: 'Project name, status, and shift date are required' });
  }

  try {
    const shift = await db.get('SELECT * FROM shifts WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!shift) {
      return res.status(404).json({ error: 'Shift not found' });
    }

    const gEarn = parseFloat(gross_earnings) || 0.00;
    const comm = parseFloat(agency_commission) || 0.00;
    const v = parseFloat(vat) || 0.00;
    const net = parseFloat(net_earnings) || 0.00;

    await db.run(
      `UPDATE shifts SET 
        project_name = ?, status = ?, shift_date = ?, call_time = ?, wrap_time = ?,
        is_public_holiday = ?, is_night_shift = ?, gross_earnings = ?, 
        agency_commission = ?, vat = ?, net_earnings = ?, 
        expected_payment_date = ?, notes = ?, agency_id = ?, rate_id = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [
        project_name, status, shift_date, call_time || null, wrap_time || null,
        is_public_holiday ? 1 : 0, is_night_shift ? 1 : 0, gEarn,
        comm, v, net, expected_payment_date || null, notes || null, agency_id || null, rate_id || null,
        id, req.user.id
      ]
    );

    const updated = await db.get(
      'SELECT s.*, a.name as agency_name FROM shifts s LEFT JOIN agencies a ON s.agency_id = a.id WHERE s.id = ?',
      [id]
    );
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update shift' });
  }
});

app.delete('/api/shifts/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.run('DELETE FROM shifts WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Shift not found' });
    }
    res.json({ message: 'Shift deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete shift' });
  }
});

// --- EXPENSES ENDPOINTS ---

app.get('/api/expenses', authenticate, async (req, res) => {
  try {
    const expenses = await db.all('SELECT * FROM expenses WHERE user_id = ? ORDER BY date_incurred DESC', [req.user.id]);
    res.json(expenses);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

app.post('/api/expenses', authenticate, async (req, res) => {
  const { category, amount, date_incurred, shift_id } = req.body;
  if (!category || amount === undefined || !date_incurred) {
    return res.status(400).json({ error: 'Category, amount, and date incurred are required' });
  }

  try {
    const expenseId = crypto.randomUUID();
    const parsedAmount = parseFloat(amount) || 0.00;

    await db.run(
      `INSERT INTO expenses (id, user_id, shift_id, category, amount, date_incurred)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [expenseId, req.user.id, shift_id || null, category, parsedAmount, date_incurred]
    );

    const created = await db.get('SELECT * FROM expenses WHERE id = ?', [expenseId]);
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

app.delete('/api/expenses/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.run('DELETE FROM expenses WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    res.json({ message: 'Expense deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// --- USER FEEDBACK ENDPOINTS ---

app.post('/api/feedback', authenticate, async (req, res) => {
  const { subject, message } = req.body;
  if (!subject || !message) {
    return res.status(400).json({ error: 'Subject and message are required' });
  }

  try {
    const feedbackId = crypto.randomUUID();
    await db.run(
      'INSERT INTO feedback (id, user_id, subject, message) VALUES (?, ?, ?, ?)',
      [feedbackId, req.user.id, subject, message]
    );
    res.status(201).json({ message: 'Feedback submitted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// --- DASHBOARD SUMMARY ENDPOINTS ---

// Dynamic check for tax year matching standard UK 06 April start
function getTaxYearRange(year, startMonthDay = '04-06') {
  const [m, d] = startMonthDay.split('-').map(Number);
  const startDate = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const endDate = `${year + 1}-${String(m).padStart(2, '0')}-${String(d - 1).padStart(2, '0')}`;
  return { startDate, endDate };
}

// Find tax year for a given date string YYYY-MM-DD
function getTaxYearForDate(dateStr, startMonthDay = '04-06') {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const [m, d] = startMonthDay.split('-').map(Number);
  const taxCutoff = new Date(year, m - 1, d);

  if (date >= taxCutoff) {
    return year; // Tax year matches the starting year
  } else {
    return year - 1;
  }
}

app.get('/api/dashboard/summary', authenticate, async (req, res) => {
  const yearParam = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();

  try {
    const userId = req.user.id;
    const taxStartDay = req.user.tax_year_start || '04-06';

    // 1. Net Earnings Total (all time)
    const netTotalRow = await db.get(
      'SELECT SUM(net_earnings) as total FROM shifts WHERE user_id = ?',
      [userId]
    );
    const netEarningsTotal = netTotalRow.total || 0;

    // 2. Pending Payments (status != Paid)
    const pendingSumRow = await db.get(
      "SELECT SUM(net_earnings) as total FROM shifts WHERE user_id = ? AND status != 'Paid'",
      [userId]
    );
    const pendingTotal = pendingSumRow.total || 0;

    const pendingShifts = await db.all(
      `SELECT s.id, s.shift_date, s.project_name, s.net_earnings, a.name as agency_name 
       FROM shifts s 
       LEFT JOIN agencies a ON s.agency_id = a.id
       WHERE s.user_id = ? AND s.status != 'Paid'
       ORDER BY s.shift_date ASC`,
      [userId]
    );

    // 3. Tax Year aggregation
    const currentTaxYear = getTaxYearForDate(new Date().toISOString().split('T')[0], taxStartDay);
    const { startDate: taxStart, endDate: taxEnd } = getTaxYearRange(currentTaxYear, taxStartDay);

    const taxShiftsRow = await db.get(
      `SELECT SUM(gross_earnings) as gross, SUM(agency_commission) as comm, SUM(vat) as vat 
       FROM shifts 
       WHERE user_id = ? AND shift_date >= ? AND shift_date <= ?`,
      [userId, taxStart, taxEnd]
    );

    const taxExpensesRow = await db.get(
      `SELECT SUM(amount) as expenses 
       FROM expenses 
       WHERE user_id = ? AND date_incurred >= ? AND date_incurred <= ?`,
      [userId, taxStart, taxEnd]
    );

    const grossEarnings = taxShiftsRow.gross || 0;
    const totalExpenses = taxExpensesRow.expenses || 0;
    const commSub = taxShiftsRow.comm || 0;
    const vatSub = taxShiftsRow.vat || 0;
    // Net profit = Gross - Expenses - Commission - VAT
    const netProfit = grossEarnings - totalExpenses - commSub - vatSub;

    // 4. Monthly bar chart of net earnings for the requested calendar year
    // Setup array for Jan - Dec
    const monthlyEarnings = Array(12).fill(0);
    const startDateYear = `${yearParam}-01-01`;
    const endDateYear = `${yearParam}-12-31`;

    const monthlyData = await db.all(
      `SELECT shift_date, net_earnings 
       FROM shifts 
       WHERE user_id = ? AND shift_date >= ? AND shift_date <= ?`,
      [userId, startDateYear, endDateYear]
    );

    monthlyData.forEach(row => {
      const monthIndex = new Date(row.shift_date).getMonth(); // 0-11
      if (monthIndex >= 0 && monthIndex < 12) {
        monthlyEarnings[monthIndex] += row.net_earnings;
      }
    });

    res.json({
      netEarningsTotal,
      pendingTotal,
      pendingShifts,
      taxYear: {
        label: `${String(currentTaxYear).slice(-2)}/${String(currentTaxYear + 1).slice(-2)}`,
        startDate: taxStart,
        endDate: taxEnd,
        gross: grossEarnings,
        expenses: totalExpenses,
        net: netProfit
      },
      chartData: {
        year: yearParam,
        months: monthlyEarnings
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to compile dashboard summary' });
  }
});

// Tax Exporter API
app.get('/api/dashboard/tax-summary', authenticate, async (req, res) => {
  const { start_date, end_date } = req.query;
  if (!start_date || !end_date) {
    return res.status(400).json({ error: 'Start date and end date are required' });
  }

  try {
    const userId = req.user.id;

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

    res.json({
      dateRange: { start: start_date, end: end_date },
      gross,
      expenses,
      commission: comm,
      vat,
      netProfit
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate tax summary export' });
  }
});

// --- ADMIN ENDPOINTS (Role-Protected) ---

// Admin panel dashboard statistics
app.get('/api/admin/stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Total Users
    const usersCount = await db.get('SELECT COUNT(*) as count FROM users');

    // New Users today
    const newUsers = await db.get(
      'SELECT COUNT(*) as count FROM users WHERE date(created_at) = ?',
      [today]
    );

    // Daily Active Users (DAU)
    const dau = await db.get(
      'SELECT COUNT(DISTINCT user_id) as count FROM user_sessions WHERE last_active_date = ?',
      [today]
    );

    // List of Users
    const userList = await db.all(
      'SELECT id, email, role, created_at FROM users ORDER BY created_at DESC'
    );

    res.json({
      stats: {
        totalUsers: usersCount.count,
        newUsersToday: newUsers.count,
        dailyActiveUsers: dau.count,
      },
      users: userList
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve admin stats' });
  }
});

// Admin panel view complaints and feedback logs
app.get('/api/admin/feedback', authenticate, requireAdmin, async (req, res) => {
  try {
    const list = await db.all(
      `SELECT f.*, u.email 
       FROM feedback f 
       JOIN users u ON f.user_id = u.id 
       ORDER BY f.created_at DESC`
    );
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve feedback logs' });
  }
});

// Serve frontend SPA fallback
app.get('/*splat', (req, res) => {
  res.sendFile(path.join(__dirname, '../web', 'index.html'));
});

// Initialize database tables, then start listening
const PORT = process.env.PORT || 3000;
db.initDb()
  .then(() => {
    // Only listen if not running in Vercel Serverless environment
    if (!process.env.VERCEL) {
      app.listen(PORT, () => {
        console.log(`[SetSum Backend] Running at http://localhost:${PORT}`);
      });
    }
  })
  .catch((err) => {
    console.error('[SetSum Backend] Failed to initialize DB:', err);
    if (!process.env.VERCEL) {
      process.exit(1);
    }
  });

module.exports = app;
