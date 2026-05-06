// Set required env vars before any module that imports env.ts is loaded.
// These are test-only values — no real DB or secret is used.
process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.NODE_ENV = "test";
