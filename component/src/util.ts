import type Device from "./device";

let last_clock_printed: Record<number, number> = {};

export function print(device: Device, msg: any) {
  if (!(device.id in last_clock_printed)) last_clock_printed[device.id] = 0;

  for (let i = 0; i < device.lamport - last_clock_printed[device.id] - 1; i++) {
    console.log(last_clock_printed[device.id] + i + 1 + ".\t");
  }

  console.log(device.lamport + ".\t" + String(msg).trim());
  last_clock_printed[device.id] = device.lamport;
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
