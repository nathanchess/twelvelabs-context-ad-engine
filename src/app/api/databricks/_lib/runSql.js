import { DBSQLClient } from "@databricks/sql";

/**
 * @param {(session: import('@databricks/sql').DBSQLSession) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withDatabricksSession(fn) {
  const token = process.env.DATABRICKS_TOKEN;
  const host = process.env.DATABRICKS_HOST;
  const path = process.env.DATABRICKS_HTTP_PATH;
  if (!token || !host || !path) {
    const err = new Error(
      "Databricks is not configured. Set DATABRICKS_TOKEN, DATABRICKS_HOST, and DATABRICKS_HTTP_PATH."
    );
    err.code = "DATABRICKS_NOT_CONFIGURED";
    throw err;
  }

  const client = new DBSQLClient();
  await client.connect({ token, host, path });
  const session = await client.openSession();
  try {
    return await fn(session);
  } finally {
    await session.close();
    await client.close();
  }
}

/**
 * Run a single SQL statement and wait for completion.
 * @param {string} statement
 */
export async function executeSql(statement) {
  return withDatabricksSession(async (session) => {
    const op = await session.executeStatement(statement);
    await op.fetchAll();
    return { ok: true };
  });
}
