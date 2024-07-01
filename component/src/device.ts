import mqtt, { MqttClient } from "mqtt";
import { delay, print } from "./util";

interface Message {
  sender: number;
  to: number;
  data: string;
  clock: number;
}

export default class Device {
  id: number; // ID do dispositivo
  lamport: number = 0; // Relógio local de lamport
  mqtt_client!: MqttClient; // Cliente MQTT
  leader: number | undefined; // ID do líder
  is_trying_leader: boolean = false; // Flag se dispositivo está tentando eleição
  devices_online = new Set<number>(); // Lista de dispositivos online
  token: boolean = false; // Flag de exclusão mútua

  constructor(id: number) {
    this.id = id;
  }

  public async connect() {
    this.mqtt_client = await mqtt.connectAsync("mqtt://test.mosquitto.org");
    await this.mqtt_client.subscribeAsync("mc714-tgb");
    this.mqtt_client.on(
      "message",
      async (_tpc, msg) => await this.receive(msg.toString()),
    );

    print(this, "Connected");
  }

  public send(data: string, to: number = -1) {
    this.lamport++;

    let message: Message = {
      sender: this.id,
      to,
      data,
      clock: this.lamport,
    };

    this.mqtt_client.publish("mc714-tgb", JSON.stringify(message));

    print(this, "Sent: " + data);
  }

  private async receive(msg: string) {
    let message: Message = JSON.parse(msg);
    if (message.sender === this.id) return;
    if (message.to !== this.id && message.to !== -1) return;

    this.lamport = Math.max(this.lamport, message.clock) + 1;

    print(this, "Received from " + message.sender + ": " + message.data);

    if (message.data === "Election") {
      if (this.id > message.sender) {
        this.send("ImHigher", message.sender);
        this.tryLeader();
      }
    }

    if (message.data === "ImHigher") {
      this.is_trying_leader = false;
    }

    if (message.data === "ImLeader") {
      this.leader = message.sender;
    }

    if (message.data === "WhoIsOnline") {
      this.devices_online.clear();
      this.devices_online.add(message.sender);
      this.send("ImOnline");
    }

    if (message.data === "ImOnline") {
      this.devices_online.add(message.sender);
    }

    if (message.data === "Token") {
      this.token = true;
      await this.useResource();
      this.passOnToken();
    }
  }

  public tryLeader() {
    if (this.is_trying_leader) return;
    this.is_trying_leader = true;

    this.send("Election");

    setTimeout(() => {
      if (this.is_trying_leader) {
        this.leader = this.id;
        this.send("ImLeader");
        this.send("WhoIsOnline");
      }
    }, 3000);
  }

  public async useResource() {
    if (!this.token) return;
    await delay(2000 + Math.random() * 3000);
  }

  public passOnToken() {
    if (!this.token) return;

    let next =
      Array.from(this.devices_online)
        .sort((a, b) => a - b)
        .find((id) => id > this.id) ||
      Math.min(...Array.from(this.devices_online));

    this.send("Token", next);
    this.token = false;
  }
}
