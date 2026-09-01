const path = require('path');
const crypto = require('crypto');

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
const usePostgres = !!connectionString;

let sqliteDb = null;
let pgPool = null;

// Initialize Database connection
if (usePostgres) {
  const { Pool } = require('pg');
  const { parse } = require('pg-connection-string');
  const pgConfig = parse(connectionString);
  pgConfig.ssl = { rejectUnauthorized: false }; // Bypass self-signed certificate chain issue
  pgPool = new Pool(pgConfig);
} else {
  if (process.env.VERCEL) {
    throw new Error("Missing database connection string. Please configure DATABASE_URL or link Supabase in your Vercel Project Settings.");
  }
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.join(__dirname, '../data/setsum.db');
  sqliteDb = new sqlite3.Database(dbPath);
  sqliteDb.run('PRAGMA foreign_keys = ON;');
}

// Secure password hashing helper (PBKDF2 with unique cryptographic salt per user)
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}.${hash}`;
}

function verifyPassword(password, storedPasswordHash) {
  try {
    const parts = storedPasswordHash.split('.');
    if (parts.length !== 2) return false;
    const [salt, originalHash] = parts;
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === originalHash;
  } catch (e) {
    return false;
  }
}

// Helper to convert SQLite ? to PostgreSQL $1, $2, ...
function convertSql(sql) {
  if (!usePostgres) return sql;
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

// Helper to run query and return Promise
const run = (sql, params = []) => {
  if (usePostgres) {
    return new Promise(async (resolve, reject) => {
      try {
        const converted = convertSql(sql);
        const res = await pgPool.query(converted, params);
        resolve({ id: res.rows[0]?.id || null, changes: res.rowCount });
      } catch (err) {
        reject(err);
      }
    });
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }
};

// Helper to get single row
const get = (sql, params = []) => {
  if (usePostgres) {
    return new Promise(async (resolve, reject) => {
      try {
        const converted = convertSql(sql);
        const res = await pgPool.query(converted, params);
        resolve(res.rows[0] || null);
      } catch (err) {
        reject(err);
      }
    });
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
};

// Helper to get all rows
const all = (sql, params = []) => {
  if (usePostgres) {
    return new Promise(async (resolve, reject) => {
      try {
        const converted = convertSql(sql);
        const res = await pgPool.query(converted, params);
        resolve(res.rows);
      } catch (err) {
        reject(err);
      }
    });
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

// Helper to run transactions or sequence
const exec = (sql) => {
  if (usePostgres) {
    return new Promise(async (resolve, reject) => {
      try {
        // Postgres doesn't support PRAGMA foreign_keys, so let's ignore it if it is PRAGMA
        if (sql.trim().toUpperCase().startsWith('PRAGMA')) {
          resolve();
          return;
        }
        await pgPool.query(sql);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};

// Initialize DB schemas
async function initDb() {
  if (usePostgres) {
    // Migration: ensure last_active_time exists on Supabase Postgres
    try {
      await run('ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS last_active_time TEXT');
    } catch (migErr) {
      console.warn('[Postgres Migration Warning]:', migErr.message);
    }

    const adminEmail = 'admin@setsum.co.uk';
    const existingAdmin = await get('SELECT * FROM users WHERE email = $1', [adminEmail]);
    if (!existingAdmin) {
      const adminId = crypto.randomUUID();
      const passwordHash = hashPassword('admin123');
      await run(
        `INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
        [adminId, adminEmail, passwordHash, 'admin']
      );
    }
    return;
  }

  // SQLite Initialization
  await exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      default_commission_rate REAL DEFAULT 20.00,
      tax_year_start TEXT DEFAULT '04-06',
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      last_active_date TEXT NOT NULL,
      last_active_time TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pay_rates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      shift_type TEXT NOT NULL,
      base_rate REAL NOT NULL,
      holiday_base_rate REAL NOT NULL,
      overtime_rate REAL NOT NULL,
      holiday_overtime_rate REAL NOT NULL,
      holiday_pay REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, shift_type)
    );

    CREATE TABLE IF NOT EXISTS agencies (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      agency_id TEXT,
      rate_id TEXT,
      project_name TEXT NOT NULL,
      status TEXT CHECK(status IN ('Unavailable', 'Pencilled', 'Booked', 'Paid')) NOT NULL,
      shift_date TEXT NOT NULL,
      call_time TEXT,
      wrap_time TEXT,
      is_public_holiday INTEGER DEFAULT 0,
      is_night_shift INTEGER DEFAULT 0,
      gross_earnings REAL DEFAULT 0.00,
      agency_commission REAL DEFAULT 0.00,
      vat REAL DEFAULT 0.00,
      net_earnings REAL DEFAULT 0.00,
      expected_payment_date TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL,
      FOREIGN KEY (rate_id) REFERENCES pay_rates(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      shift_id TEXT,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      date_incurred TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL
    );
  `);

  // Migration check: ensure last_active_time column exists in user_sessions
  try {
    await exec(`ALTER TABLE user_sessions ADD COLUMN last_active_time TEXT`);
  } catch (err) {
    // Column already exists, ignore
  }

  // Seed default pay rates
  const ratesCount = await get('SELECT COUNT(*) as count FROM pay_rates');
  if (ratesCount.count === 0) {
    const defaultRates = [
      {
        name: 'FAA/PACT Daily Rate',
        shift_type: 'Day',
        base_rate: 111.21,
        holiday_base_rate: 166.82,
        overtime_rate: 11.69,
        holiday_overtime_rate: 17.54,
        holiday_pay: 13.42,
      },
      {
        name: 'FAA/PACT Daily Rate',
        shift_type: 'Night',
        base_rate: 148.28,
        holiday_base_rate: 222.42,
        overtime_rate: 15.58,
        holiday_overtime_rate: 23.38,
        holiday_pay: 17.89,
      },
      {
        name: 'BBC Supporting Artiste Day Rate',
        shift_type: 'Day',
        base_rate: 97.68,
        holiday_base_rate: 97.68,
        overtime_rate: 14.10,
        holiday_overtime_rate: 14.10,
        holiday_pay: 11.79,
      },
      {
        name: 'BBC Supporting Artiste Day Rate',
        shift_type: 'Night',
        base_rate: 130.24,
        holiday_base_rate: 130.24,
        overtime_rate: 18.80,
        holiday_overtime_rate: 18.80,
        holiday_pay: 15.72,
      },
      {
        name: 'BBC Walk-on Day Rate',
        shift_type: 'Day',
        base_rate: 114.90,
        holiday_base_rate: 114.90,
        overtime_rate: 17.50,
        holiday_overtime_rate: 17.50,
        holiday_pay: 13.87,
      },
      {
        name: 'BBC Walk-on Day Rate',
        shift_type: 'Night',
        base_rate: 153.20,
        holiday_base_rate: 153.20,
        overtime_rate: 23.33,
        holiday_overtime_rate: 23.33,
        holiday_pay: 18.49,
      },
      {
        name: 'PACT/Equity Standard Day (Outside London)',
        shift_type: 'Day',
        base_rate: 114.39,
        holiday_base_rate: 171.59,
        overtime_rate: 9.53,
        holiday_overtime_rate: 14.30,
        holiday_pay: 13.81,
      },
      {
        name: 'PACT/Equity Standard Day (Outside London)',
        shift_type: 'Night',
        base_rate: 152.52,
        holiday_base_rate: 228.79,
        overtime_rate: 12.71,
        holiday_overtime_rate: 19.07,
        holiday_pay: 18.41,
      },
    ];

    for (const rate of defaultRates) {
      await run(
        `INSERT INTO pay_rates (id, name, shift_type, base_rate, holiday_base_rate, overtime_rate, holiday_overtime_rate, holiday_pay)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          rate.name,
          rate.shift_type,
          rate.base_rate,
          rate.holiday_base_rate,
          rate.overtime_rate,
          rate.holiday_overtime_rate,
          rate.holiday_pay,
        ]
      );
    }
  }

  // Create a default admin user if not exists
  const adminEmail = 'admin@setsum.co.uk';
  const existingAdmin = await get('SELECT * FROM users WHERE email = ?', [adminEmail]);
  if (!existingAdmin) {
    const adminId = crypto.randomUUID();
    const passwordHash = hashPassword('admin123');
    await run(
      `INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)`,
      [adminId, adminEmail, passwordHash, 'admin']
    );
  }
}

module.exports = {
  run,
  get,
  all,
  exec,
  initDb,
  hashPassword,
  verifyPassword,
};
