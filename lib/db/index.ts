import { createClient, Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

// Database client singleton
let client: Client | null = null;

export function getDbClient(): Client {
  if (!client) {
    const databaseUrl = process.env.DATABASE_URL || 'file:./data/swagbot.db';
    
    client = createClient({
      url: databaseUrl,
    });
  }
  
  return client;
}

// Drizzle ORM instance
export const db = drizzle(getDbClient(), { schema });

// Helper function to close database connection (useful for testing)
export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}
