const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Integration tests require DATABASE_URL in .env or the process environment.');
  process.exit(1);
}

try {
  if (new URL(connectionString).searchParams.get('schema') !== 'shopmate') {
    throw new Error('wrong schema');
  }
} catch {
  console.error('Integration tests require a PostgreSQL DATABASE_URL scoped to schema=shopmate.');
  process.exit(1);
}
