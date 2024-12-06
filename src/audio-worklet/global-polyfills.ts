import { Buffer } from 'buffer';

const atob = (str: string) => Buffer.from(str, 'base64').toString('binary');
const btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');

Object.assign(globalThis, {
  atob,
  btoa,
});
