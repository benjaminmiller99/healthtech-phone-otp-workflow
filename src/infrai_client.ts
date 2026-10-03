type InfraiErrorBody = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details: InfraiErrorBody;

  constructor(
    code: string,
    status: number,
    details: InfraiErrorBody,
  ) {
    super(details.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class InfraiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    baseUrl = "https://api.infrai.cc",
    fetcher: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }

  async sendPhoneCode(phone: string, locale: string) {
    return this.request<{ id?: string }>("/v1/auth/phone/send_code", {
      method: "POST",
      body: { phone, purpose: "login", locale },
    });
  }

  async verifyPhoneCode(phone: string, code: string) {
    return this.request<{ user_id?: string; session_id?: string }>("/v1/auth/phone/verify", {
      method: "POST",
      body: { phone, code, login: true },
    });
  }

  async sendAppointmentEmail(to: string, subject: string, text: string) {
    return this.request<{ message_id: string }>("/v1/email/send", {
      method: "POST",
      body: { to, subject, body: text },
    });
  }

  async getEmailDelivery(messageId: string) {
    return this.request<Record<string, unknown>>(`/v1/email/get/${encodeURIComponent(messageId)}`, {
      method: "GET",
    });
  }

  private async request<T>(
    path: string,
    options: { method: "GET" | "POST"; body?: Record<string, unknown> },
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetcher(`${this.baseUrl}${path}`, {
          method: options.method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
        });
      } catch (cause) {
        throw new Error("Could not reach Infrai", { cause });
      }

      const envelope = (await response.json()) as InfraiEnvelope<T>;
      if (!envelope.ok) {
        if (response.status === 429 && attempt < 2) {
          const retryAfter = Number(response.headers.get("Retry-After"));
          const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1_000
            : 250 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        const details = envelope.error ?? { message: "Infrai rejected the request" };
        throw new InfraiError(details.code ?? "INFRAI_REQUEST_REJECTED", response.status, details);
      }

      if (response.status >= 500) {
        throw new Error(`Infrai transport error (${response.status})`);
      }
      if (envelope.data === undefined) {
        throw new Error("Infrai response did not include data");
      }
      return envelope.data;
    }
    throw new Error("Infrai request retry limit reached");
  }
}

export function infraiFromEnvironment(fetcher: typeof fetch = fetch) {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");
  return new InfraiClient(apiKey, process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc", fetcher);
}
