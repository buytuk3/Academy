declare module "cors" {
  function cors(options?: any): any;
  export = cors;
}
declare module "jsonwebtoken" {
  export type Secret = string | Buffer;
  export type SignOptions = any;
  export type VerifyOptions = any;
  export type JwtPayload = { [k: string]: any };
  export type Jwt = { [k: string]: any };
  export function sign(payload: any, secret: Secret, options?: SignOptions): string;
  export function verify(token: string, secret: Secret, options?: VerifyOptions): any;
  export function decode(token: string, options?: any): any;
}
