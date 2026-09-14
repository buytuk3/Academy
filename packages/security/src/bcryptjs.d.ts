declare module "bcryptjs" {
  export function genSalt(rounds?: number): Promise<string>;
  export function hash(s: string, salt: number | string): Promise<string>;
  export function compare(s: string, hash: string): Promise<boolean>;
  export function hashSync(s: string, salt: number | string): string;
  export function compareSync(s: string, hash: string): boolean;
  const _default: {
    genSalt: typeof genSalt; hash: typeof hash; compare: typeof compare;
    hashSync: typeof hashSync; compareSync: typeof compareSync;
  };
  export default _default;
}
