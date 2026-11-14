export type Row = Record<string, any>;
export type Delegate = {
  findMany(args?: any): Promise<Row[]>;
  findUnique(args: any): Promise<Row | null>;
  findFirst(args?: any): Promise<Row | null>;
  count(args?: any): Promise<number>;
  create(args: any): Promise<Row>;
  createMany(args: any): Promise<any>;
  update(args: any): Promise<Row>;
  updateMany(args: any): Promise<any>;
};
export type Database = Record<string, Delegate> & {
  $transaction: <T>(fn: (tx: Database) => Promise<T>) => Promise<T>;
};
export type Field = {
  name: string;
  label: string;
  type?: string;
  options?: string[];
  value?: string | number;
  required?: boolean;
  min?: number;
  max?: number;
  hint?: string;
};
export type Form = {
  title: string;
  op: string;
  fields: Field[];
  hidden?: Row;
  button?: string;
};
export type View = {
  app: string;
  path: string;
  role: string;
  roles: string[];
  title: string;
  subtitle: string;
  nav: { href: string; label: string }[];
  metrics: { label: string; value: string | number; note?: string }[];
  tables: { title: string; columns: string[]; rows: (string | number)[][] }[];
  forms: Form[];
  cards: { title: string; text: string; href?: string; tag?: string }[];
  chart?: { label: string; value: number }[];
  extra?: Row;
};
