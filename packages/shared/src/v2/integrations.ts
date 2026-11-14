import { HubError, type Data } from "./types";
const contracts = {
  aiStartify: ["AI_STARTIFY_BASE_URL", "AI_STARTIFY_TOKEN"],
  authentication: ["IDENTITY_ISSUER", "IDENTITY_AUDIENCE"],
  payments: ["PAYMENT_PROVIDER", "PAYMENT_SECRET"],
  videoRenderer: ["VIDEO_RENDER_PROVIDER", "VIDEO_RENDER_TOKEN"],
  publishing: ["PUBLISH_PROVIDER", "PUBLISH_TOKEN"],
  signing: ["SIGN_PROVIDER", "SIGN_TOKEN"],
  codeExecution: ["SANDBOX_PROVIDER", "SANDBOX_TOKEN"],
} as const;
export type IntegrationName = keyof typeof contracts;
/** A credential being present is not proof that a vendor contract is implemented or connected. */
export function integrationStatus(env: NodeJS.ProcessEnv = process.env) {
  return Object.fromEntries(
    Object.entries(contracts).map(([name, required]) => [
      name,
      {
        status: "not_connected",
        configured: required.every((key) => !!env[key]),
        missingSettings: required.filter((key) => !env[key]),
        reason:
          "Provider implementation and owner-approved contract must be verified before activation",
      },
    ]),
  );
}
export interface IntegrationAdapter {
  name: IntegrationName;
  execute(input: Data): Promise<Data>;
}
export class NotConnectedAdapter implements IntegrationAdapter {
  constructor(public name: IntegrationName) {}
  async execute(_input: Data): Promise<Data> {
    throw new HubError(
      "integration_not_connected",
      `${this.name}: provider is not connected; use the documented local/manual route`,
      503,
    );
  }
}
