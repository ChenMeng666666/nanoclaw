import type { RuntimeApiSecurityPolicy } from './models.js';

export interface RuntimeApiSecurityEnvironment {
  runtimeApiKey?: string;
  allowNoAuth: boolean;
}

export class RuntimeApiSecurityPolicyService {
  resolve(
    environment: RuntimeApiSecurityEnvironment,
  ): RuntimeApiSecurityPolicy {
    if (!environment.runtimeApiKey && !environment.allowNoAuth) {
      throw new Error(
        'RUNTIME_API_KEY is required unless RUNTIME_API_ALLOW_NO_AUTH=true',
      );
    }
    return {
      allowNoAuth: environment.allowNoAuth,
      apiKey: environment.runtimeApiKey,
    };
  }
}

export const runtimeApiSecurityPolicyService =
  new RuntimeApiSecurityPolicyService();
