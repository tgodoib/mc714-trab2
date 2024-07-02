import Device from "./device";
import { delay } from "./util";

let device = new Device(parseInt(Bun.env.ID || "0"));

await device.connect();

await delay(3000 + Math.random() * 5000);

if (device.id === 0) device.tryLeader();

setTimeout(() => {
  if (device.id === 1) {
    device.token = true;
    device.passOnToken();
  }
}, 10000);
