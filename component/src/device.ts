import mqtt, { MqttClient } from "mqtt";
import { delay, print } from "./util";

// Formato das mensagens trocadas entre os dispositivos
interface Message {
  sender: number; // ID do rementente
  to: number; // ID do destinatário (-1 para todos os dispositivos)
  data: string; // Mensagem em si
  clock: number; // Relogio local do rementente
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
    // Conecta ao broker MQTT
    this.mqtt_client = await mqtt.connectAsync("mqtt://test.mosquitto.org");

    // Se inscreve no tópico "mc714-tgb" para receber mensagens
    await this.mqtt_client.subscribeAsync("mc714-tgb");

    // Encaminha as mensagens recebidas para o método receive
    this.mqtt_client.on(
      "message",
      async (_tpc, msg) => await this.receive(msg.toString()),
    );

    print(this, "Connected");
  }

  public send(data: string, to: number = -1) {
    // Incrementa o relógio de lamport local
    this.lamport++;

    let message: Message = {
      sender: this.id,
      to,
      data,
      clock: this.lamport,
    };

    // Publica a mensagem para os outros dispositivos
    this.mqtt_client.publish("mc714-tgb", JSON.stringify(message));

    print(this, "Sent: " + data);
  }

  private async receive(msg: string) {
    let message: Message = JSON.parse(msg);
    if (message.sender === this.id) return; // Ignora mensagens enviadas por si mesmo
    if (message.to !== this.id && message.to !== -1) return; // Ignora mensagens que não são para si

    // Atualiza o relógio de lamport local com o valor recebido
    this.lamport = Math.max(this.lamport, message.clock) + 1;

    print(this, "Received from " + message.sender + ": " + message.data);

    // Ao receber mensagem de eleição, responde se tiver ID maior
    // Se tiver ID maior, inicia sua própria eleição
    if (message.data === "Election") {
      if (this.id > message.sender) {
        this.send("ImHigher", message.sender);
        this.tryLeader();
      }
    }

    // Caso alguém responda a sua eleição, desiste de ser líder
    if (message.data === "ImHigher") {
      this.is_trying_leader = false;
    }

    // Reconhece o novo líder
    if (message.data === "ImLeader") {
      this.leader = message.sender;
    }

    // Responde que está online, e registra que o remetente está online
    if (message.data === "WhoIsOnline") {
      this.devices_online.clear();
      this.devices_online.add(message.sender);
      this.send("ImOnline");
    }

    // Registra que o remetente está online
    if (message.data === "ImOnline") {
      this.devices_online.add(message.sender);
    }

    // Recebe o token de mutual exclusion, usa o recurso, e passa o token para o próximo
    if (message.data === "Token") {
      this.token = true;
      await this.useResource();
      this.passOnToken();
    }
  }

  public tryLeader() {
    // Se já estiver tentando ser líder, não tenta novamente
    if (this.is_trying_leader) return;
    this.is_trying_leader = true;

    this.send("Election");

    // Se ninguém responder em 3 segundos, assume que é líder
    // Ao assumir a liderança, checa quem está online
    setTimeout(() => {
      if (this.is_trying_leader) {
        this.leader = this.id;
        this.send("ImLeader");
        this.send("WhoIsOnline");
      }
    }, 3000);
  }

  public async useResource() {
    // Simulação de uso do recurso
    if (!this.token) return;
    await delay(2000 + Math.random() * 3000);
  }

  public passOnToken() {
    if (!this.token) return;

    // Acha o próximo dispositivo online
    let next =
      Array.from(this.devices_online)
        .sort((a, b) => a - b)
        .find((id) => id > this.id) ||
      Math.min(...Array.from(this.devices_online));

    // Repassa o token para o próximo dispositivo
    this.send("Token", next);
    this.token = false;
  }
}
