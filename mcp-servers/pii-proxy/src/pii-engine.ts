import crypto from 'crypto';
import type Database from 'better-sqlite3';

const NAME_FIELDS = new Set(['firstName', 'lastName', 'middleName', 'fullName']);
const EMAIL_FIELDS = new Set(['email']);
const PHONE_FIELDS = new Set(['phone', 'mobilePhone']);
const ADDRESS_FIELDS = new Set(['address']);
const CITY_FIELDS = new Set(['city']);
const STATE_FIELDS = new Set(['state']);
const ZIP_FIELDS = new Set(['zipCode', 'zip']);
const DATE_FIELDS = new Set(['birthDate', 'dateOfBirth']);
const ID_FIELDS = new Set(['tin', 'lei', 'nationalId', 'taxResidency']);
const IP_FIELDS = new Set(['clientIp', 'ip']);
const REDACT_FIELDS = new Set([
  'password', 'investorPassword', 'token', 'refreshToken', 'accessToken',
]);
const FINANCIAL_FIELDS = new Set(['balance', 'equity', 'margin', 'credit', 'marginFree']);

const ADJECTIVES = ['Amber','Azure','Coral','Crimson','Cyan','Fern','Gold',
  'Indigo','Ivory','Jade','Lapis','Lime','Mauve','Mist','Olive','Onyx',
  'Pearl','Pine','Rose','Ruby','Sage','Sand','Silver','Slate','Steel',
  'Teal','Terra','Topaz','Umber','Violet'];
const NOUNS = ['Arrow','Bear','Brook','Cedar','Cliff','Crane','Creek','Crow',
  'Dune','Eagle','Fawn','Finch','Flint','Frost','Grove','Hawk','Heath',
  'Heron','Hill','Iris','Kite','Lake','Lark','Leaf','Lynx','Mare','Marsh',
  'Moor','Moss','Peak','Pine','Reed','Ridge','River','Robin','Rock','Shore',
  'Skye','Spruce','Stone','Swan','Tern','Vale','Wren'];

interface PiiEngineOptions {
  db: InstanceType<typeof Database>;
  hmacSecret: string;
  maskFinancials: boolean;
}

export class PiiEngine {
  private db: InstanceType<typeof Database>;
  private secret: string;
  private maskFinancials: boolean;

  constructor(opts: PiiEngineOptions) {
    this.db = opts.db;
    this.secret = opts.hmacSecret;
    this.maskFinancials = opts.maskFinancials;
  }

  private hash(value: string): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(value)
      .digest('hex')
      .slice(0, 8);
  }

  private store(masked: string, real: string, fieldType: string): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO pii_map (masked, real, field_type, created_at)
      VALUES (?, ?, ?, ?)
    `).run(masked, real, fieldType, Date.now());
  }

  maskField(value: string | null | undefined, fieldName: string): string {
    if (value === null || value === undefined || value === '') return value ?? '';
    if (REDACT_FIELDS.has(fieldName)) return '[REDACTED]';
    if (this.maskFinancials && FINANCIAL_FIELDS.has(fieldName)) return '[MASKED]';

    const h = this.hash(value);

    if (NAME_FIELDS.has(fieldName)) {
      const adj = ADJECTIVES[parseInt(h.slice(0, 2), 36) % ADJECTIVES.length];
      const noun = NOUNS[parseInt(h.slice(2, 4), 36) % NOUNS.length];
      const masked = `${adj} ${noun}`;
      this.store(masked, value, fieldName);
      return masked;
    }
    if (EMAIL_FIELDS.has(fieldName)) {
      const masked = `masked-${h}@masked.example`;
      this.store(masked, value, fieldName);
      return masked;
    }
    if (PHONE_FIELDS.has(fieldName)) {
      const masked = `+00-${h}`;
      this.store(masked, value, fieldName);
      return masked;
    }
    if (ADDRESS_FIELDS.has(fieldName)) {
      const masked = `${h} Masked St`;
      this.store(masked, value, fieldName);
      return masked;
    }
    if (CITY_FIELDS.has(fieldName)) {
      const masked = `Masked City ${h.slice(0, 4)}`;
      this.store(masked, value, fieldName);
      return masked;
    }
    if (STATE_FIELDS.has(fieldName) || ZIP_FIELDS.has(fieldName)) {
      const masked = STATE_FIELDS.has(fieldName) ? 'MS' : '00000';
      this.store(masked, value, fieldName);
      return masked;
    }
    if (DATE_FIELDS.has(fieldName)) {
      const shift = (parseInt(h.slice(0, 4), 16) % 180) - 90;
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() + shift);
        const masked = d.toISOString().split('T')[0];
        this.store(masked, value, fieldName);
        return masked;
      }
    }
    if (ID_FIELDS.has(fieldName)) {
      const masked = `MASKED-${h}`;
      this.store(masked, value, fieldName);
      return masked;
    }
    if (IP_FIELDS.has(fieldName)) return '0.0.0.0';

    return value;
  }

  maskObject(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map(item => this.maskObject(item));
    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
        result[key] = typeof val === 'string' ? this.maskField(val, key) : this.maskObject(val);
      }
      return result;
    }
    return obj;
  }

  scanFreetext(text: string): string {
    // Mask emails
    let result = text.replace(
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
      match => {
        const masked = `masked-${this.hash(match)}@masked.example`;
        this.store(masked, match, 'email_freetext');
        return masked;
      },
    );
    // Mask phone numbers (international and local formats)
    result = result.replace(
      /\b(\+?[\d][\d\s\-().]{7,}\d)\b/g,
      match => {
        const masked = `+00-${this.hash(match)}`;
        this.store(masked, match, 'phone_freetext');
        return masked;
      },
    );
    // Mask card-like numbers (16 digits, optionally space/dash separated)
    result = result.replace(
      /\b(\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4})\b/g,
      match => {
        this.store('MASKED-CARD', match, 'card_freetext');
        return 'MASKED-CARD';
      },
    );
    return result;
  }

  unmask(masked: string): string | null {
    const row = this.db.prepare(
      'SELECT real FROM pii_map WHERE masked = ? LIMIT 1'
    ).get(masked) as { real: string } | undefined;
    return row?.real ?? null;
  }
}
