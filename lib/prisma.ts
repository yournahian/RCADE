import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  rawPrisma: PrismaClient | undefined;
};

const rawPrisma = globalForPrisma.rawPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.rawPrisma = rawPrisma;
}

const realPrisma = globalForPrisma.prisma ?? rawPrisma;

// ==========================================
// HIGH-FIDELITY SANDBOX FILE DATABASE
// ==========================================
const dbPath = typeof window === 'undefined'
  ? path.join(process.cwd(), 'scripts', 'arena-sandbox-db.json')
  : '';

let clientInMemoryDb: any = {
  seasonData: [],
  playerArenaStats: [],
  playerGameRank: [],
  trophyHistory: [],
  arenaQueue: [],
  arenaRoom: [],
  arenaMatch: [],
  escrowState: [],
  wagerTransaction: [],
  matchReplay: [],
  leaderboardEntry: [],
  antiFraudFlag: []
};

function readDb() {
  if (typeof window !== 'undefined') {
    return clientInMemoryDb;
  }

  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(
      dbPath,
      JSON.stringify(clientInMemoryDb, null, 2)
    );
  }
  try {
    return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  } catch {
    return {};
  }
}

function writeDb(data: any) {
  if (typeof window !== 'undefined') {
    clientInMemoryDb = data;
    return;
  }
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

function matchFilter(item: any, where: any): boolean {
  if (!where) return true;
  for (const key of Object.keys(where)) {
    const filter = where[key];
    if (key === 'OR') {
      if (Array.isArray(filter)) {
        if (!filter.some((subWhere: any) => matchFilter(item, subWhere))) {
          return false;
        }
      }
    } else if (key === 'AND') {
      if (Array.isArray(filter)) {
        if (!filter.every((subWhere: any) => matchFilter(item, subWhere))) {
          return false;
        }
      }
    } else if (key === 'NOT') {
      const filters = Array.isArray(filter) ? filter : [filter];
      if (filters.some((subWhere: any) => matchFilter(item, subWhere))) {
        return false;
      }
    } else {
      if (filter === null || filter === undefined) {
        if (item[key] !== null && item[key] !== undefined) return false;
      } else if (typeof filter === 'object' && filter !== null && !(filter instanceof Date)) {
        if (filter.in) {
          if (!filter.in.includes(item[key])) return false;
        } else if (filter.notIn) {
          if (filter.notIn.includes(item[key])) return false;
        } else {
          // Robust date-parsing comparison helper
          const getComparableValue = (v: any) => {
            if (v instanceof Date) return v.getTime();
            if (typeof v === 'string' && !isNaN(Date.parse(v))) {
              return new Date(v).getTime();
            }
            return v;
          };

          const itemComp = getComparableValue(item[key]);

          if (filter.gte !== undefined) {
            if (itemComp < getComparableValue(filter.gte)) return false;
          }
          if (filter.lte !== undefined) {
            if (itemComp > getComparableValue(filter.lte)) return false;
          }
          if (filter.gt !== undefined) {
            if (itemComp <= getComparableValue(filter.gt)) return false;
          }
          if (filter.lt !== undefined) {
            if (itemComp >= getComparableValue(filter.lt)) return false;
          }
        }
      } else {
        if (item[key] !== filter) return false;
      }
    }
  }
  return true;
}

function filterItems(items: any[], where: any): any[] {
  if (!where) return items;
  return items.filter(item => matchFilter(item, where));
}

function applyPrismaUpdate(existing: any, data: any): any {
  if (!data) return existing;
  const result = { ...existing };
  for (const key of Object.keys(data)) {
    const val = data[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      if ('increment' in val) {
        const base = typeof result[key] === 'number' ? result[key] : 0;
        result[key] = base + val.increment;
      } else if ('decrement' in val) {
        const base = typeof result[key] === 'number' ? result[key] : 0;
        result[key] = base - val.decrement;
      } else if ('multiply' in val) {
        const base = typeof result[key] === 'number' ? result[key] : 0;
        result[key] = base * val.multiply;
      } else if ('divide' in val) {
        const base = typeof result[key] === 'number' ? result[key] : 0;
        result[key] = base / val.divide;
      } else {
        result[key] = val;
      }
    } else {
      result[key] = val;
    }
  }
  return result;
}

class MockCollection {
  constructor(private key: string) {}

  private getItems() {
    const db = readDb();
    return db[this.key] || [];
  }

  private saveItems(items: any[]) {
    const db = readDb();
    db[this.key] = items;
    writeDb(db);
  }

  async findUnique(args: any) {
    const items = this.getItems();
    return items.find((item: any) => matchFilter(item, args?.where)) || null;
  }

  async findFirst(args: any) {
    const items = this.getItems();
    const filtered = filterItems(items, args?.where);
    return filtered[0] || null;
  }

  async findMany(args: any) {
    let items = this.getItems();
    if (args?.where) {
      items = filterItems(items, args.where);
    }
    if (args?.orderBy) {
      const field = Object.keys(args.orderBy)[0];
      const direction = args.orderBy[field];
      items.sort((a: any, b: any) => {
        if (a[field] < b[field]) return direction === 'asc' ? -1 : 1;
        if (a[field] > b[field]) return direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    if (args?.take) {
      items = items.slice(0, args.take);
    }
    return items;
  }

  async create(args: any) {
    const items = this.getItems();
    const newItem = {
      id: 'id_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString().substring(8),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...applyPrismaUpdate({}, args.data)
    };
    items.push(newItem);
    this.saveItems(items);
    return newItem;
  }

  async update(args: any) {
    const items = this.getItems();
    const idx = items.findIndex((item: any) => matchFilter(item, args?.where));
    if (idx === -1) {
      // Fail open: create fallback item if update is called on placing user ranks
      return this.create({ data: { ...args.where, ...args.data } });
    }
    items[idx] = {
      ...applyPrismaUpdate(items[idx], args.data),
      updatedAt: new Date()
    };
    this.saveItems(items);
    return items[idx];
  }

  async updateMany(args: any) {
    const items = this.getItems();
    let count = 0;
    const updated = items.map((item: any) => {
      if (matchFilter(item, args?.where)) {
        count++;
        return {
          ...applyPrismaUpdate(item, args.data),
          updatedAt: new Date()
        };
      }
      return item;
    });
    this.saveItems(updated);
    return { count };
  }

  async delete(args: any) {
    const items = this.getItems();
    const idx = items.findIndex((item: any) => matchFilter(item, args?.where));
    if (idx === -1) return null;
    const removed = items.splice(idx, 1)[0];
    this.saveItems(items);
    return removed;
  }

  async deleteMany(args: any) {
    const items = this.getItems();
    const beforeCount = items.length;
    const remaining = items.filter((item: any) => !matchFilter(item, args?.where));
    this.saveItems(remaining);
    return { count: beforeCount - remaining.length };
  }

  async upsert(args: any) {
    const items = this.getItems();
    const idx = items.findIndex((item: any) => matchFilter(item, args?.where));
    if (idx !== -1) {
      items[idx] = {
        ...applyPrismaUpdate(items[idx], args.update),
        updatedAt: new Date()
      };
      this.saveItems(items);
      return items[idx];
    } else {
      const newItem = {
        id: 'id_' + Math.random().toString(36).substring(2, 11),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...applyPrismaUpdate({}, args.create)
      };
      items.push(newItem);
      this.saveItems(items);
      return newItem;
    }
  }

  async count(args: any) {
    const items = this.getItems();
    if (args?.where) {
      return filterItems(items, args.where).length;
    }
    return items.length;
  }
}

// Create the dynamic prisma proxy
export const prisma = new Proxy(realPrisma, {
  get(target, prop) {
    const propStr = prop.toString();

    // Bypass local sandbox file-database in production/Vercel or if sandbox is disabled
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
    const disableSandbox = process.env.DISABLE_SANDBOX === 'true';
    if (isProduction || disableSandbox) {
      return (target as any)[prop];
    }

    const newTables = [
      'seasonData',
      'playerArenaStats',
      'playerGameRank',
      'trophyHistory',
      'arenaQueue',
      'arenaRoom',
      'arenaMatch',
      'escrowState',
      'wagerTransaction',
      'matchReplay',
      'leaderboardEntry',
      'antiFraudFlag'
    ];

    if ((target as any)[prop] === undefined) {
      return new MockCollection(propStr);
    }

    if (prop === '$transaction') {
      return async (actions: any, options?: any) => {
        if (typeof actions === 'function') {
          // Interactive transaction: execute on raw Prisma client to avoid proxy recursion,
          // but wrap the transaction client in a proxy to support mocked sandbox tables.
          return await rawPrisma.$transaction(async (realTx) => {
            const txProxy = new Proxy(realTx, {
              get(target, txProp) {
                const txPropStr = txProp.toString();
                if (newTables.includes(txPropStr)) {
                  return new MockCollection(txPropStr);
                }
                return (target as any)[txProp];
              }
            });
            return await actions(txProxy);
          }, options);
        }

        // Array of promises
        const results = [];
        for (const action of actions) {
          results.push(await action);
        }
        return results;
      };
    }

    return (target as any)[prop];
  }
}) as unknown as PrismaClient;

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
