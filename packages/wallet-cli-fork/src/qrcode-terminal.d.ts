// qrcode-terminal ships no type definitions — minimal surface we use.
declare module "qrcode-terminal" {
  export function generate(
    text: string,
    options?: { small?: boolean },
    callback?: (qr: string) => void,
  ): void;
}
