declare module "ms" {
  function ms(value: string): number | undefined;
  function ms(value: number, options?: { long: boolean }): string;

  export default ms;
}
