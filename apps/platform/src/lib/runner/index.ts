// Runner client for communicating with the agent runner service

export class RunnerClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }
}
