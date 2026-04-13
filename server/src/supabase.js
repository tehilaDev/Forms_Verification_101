import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
}

const rawClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const DB_OPS = ['select', 'insert', 'update', 'delete', 'upsert'];

function createLoggingProxy(table, target, operationRef) {
  return new Proxy(target, {
    get(obj, prop) {
      const value = Reflect.get(obj, prop);

      if (prop === 'then') {
        return function (onFulfilled, onRejected) {
          const start = Date.now();
          return value.call(
            obj,
            (res) => {
              const ms = Date.now() - start;
              const op = operationRef.op;
              if (res?.error) {
                console.error(`[db] ${op} ${table} — error (${ms}ms): ${res.error.message}`);
              } else {
                const count = Array.isArray(res?.data) ? res.data.length : res?.data != null ? 1 : 0;
                console.log(`[db] ${op} ${table} — ${count} row(s) (${ms}ms)`);
              }
              return onFulfilled ? onFulfilled(res) : res;
            },
            (err) => {
              console.error(`[db] ${operationRef.op} ${table} — threw: ${err.message}`);
              return onRejected ? onRejected(err) : Promise.reject(err);
            }
          );
        };
      }

      if (typeof value !== 'function') return value;

      return function (...args) {
        if (DB_OPS.includes(String(prop))) {
          operationRef.op = String(prop).toUpperCase();
        }
        const result = value.apply(obj, args);
        if (result && typeof result === 'object' && typeof result.then === 'function') {
          return createLoggingProxy(table, result, operationRef);
        }
        return result;
      };
    },
  });
}

const supabase = new Proxy(rawClient, {
  get(target, prop) {
    if (prop === 'from') {
      return function (table) {
        const builder = target.from(table);
        return createLoggingProxy(table, builder, { op: 'QUERY' });
      };
    }
    const value = Reflect.get(target, prop);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

export default supabase;
