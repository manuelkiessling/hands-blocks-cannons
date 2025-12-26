import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createSessionClientMessageSchema,
  createSessionServerMessageSchema,
  FRAMEWORK_PROTOCOL_VERSION,
  isFrameworkMessage,
  ParticipantIdSchema,
  ParticipantNumberSchema,
  SessionEndedReasonSchema,
} from '../src/index.js';

describe('framework-protocol', () => {
  describe('smoke test', () => {
    it('should export protocol version', () => {
      expect(FRAMEWORK_PROTOCOL_VERSION).toBe('1.0.0');
    });

    it('should validate participant id/number and session end reason', () => {
      expect(() => ParticipantIdSchema.parse('abc')).not.toThrow();
      expect(() => ParticipantNumberSchema.parse(1)).not.toThrow();
      expect(() => SessionEndedReasonSchema.parse('participant_left')).not.toThrow();
    });
  });

  describe('isFrameworkMessage', () => {
    it('should return true for framework messages', () => {
      expect(isFrameworkMessage({ type: 'participant_ready' })).toBe(true);
      expect(isFrameworkMessage({ type: 'bot_identify' })).toBe(true);
      expect(isFrameworkMessage({ type: 'play_again_vote' })).toBe(true);
      expect(isFrameworkMessage({ type: 'session_started' })).toBe(true);
      expect(isFrameworkMessage({ type: 'session_ended' })).toBe(true);
      expect(isFrameworkMessage({ type: 'session_reset' })).toBe(true);
    });

    it('should return false for app-specific messages', () => {
      expect(isFrameworkMessage({ type: 'block_grabbed' })).toBe(false);
      expect(isFrameworkMessage({ type: 'projectile_spawned' })).toBe(false);
      expect(isFrameworkMessage({ type: 'custom_app_message' })).toBe(false);
    });
  });

  describe('composition helpers', () => {
    const appClientMessageSchema = z.object({ type: z.literal('app_ping') });
    const appServerMessageSchema = z.object({ type: z.literal('app_pong') });

    const clientSchema = createSessionClientMessageSchema(appClientMessageSchema);
    const serverSchema = createSessionServerMessageSchema({
      appServerMessageSchema,
      welcomeAppDataSchema: z.object({ foo: z.string() }),
      opponentJoinedAppDataSchema: z.object({ joined: z.boolean() }).optional(),
      resetAppDataSchema: z.object({ reset: z.boolean() }).optional(),
      sessionEndedAppDataSchema: z.object({ summary: z.string() }).optional(),
    });

    it('accepts framework client messages', () => {
      expect(clientSchema.parse({ type: 'participant_ready' }).type).toBe('participant_ready');
      expect(clientSchema.parse({ type: 'app_ping' }).type).toBe('app_ping');
    });

    it('requires appData on welcome and supports optional appData on others', () => {
      const welcome = serverSchema.parse({
        type: 'welcome',
        participantId: 'p1',
        participantNumber: 1,
        sessionPhase: 'waiting',
        appData: { foo: 'bar' },
      });
      expect(welcome.type).toBe('welcome');

      const reset = serverSchema.parse({
        type: 'session_reset',
        appData: { reset: true },
      });
      expect(reset.type).toBe('session_reset');
    });
  });
});
