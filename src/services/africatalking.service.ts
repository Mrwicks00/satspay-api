import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * AfricaTalkingService
 * Provides SMS dispatching via Africa's Talking API.
 * Used as the secondary SMS provider when Termii fails.
 */
export class AfricaTalkingService {
  private static readonly BASE_URL = "https://api.africastalking.com/version1/messaging";
}
