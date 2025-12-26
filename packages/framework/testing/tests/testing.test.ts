/**
 * @fileoverview Tests for the testing utilities themselves.
 */

import { describe, expect, it } from 'vitest';
import { createMockConnection, createMockLandmarks, createMockTrackedHand } from '../src/index.js';

describe('createMockConnection', () => {
  it('should start in OPEN state', () => {
    const conn = createMockConnection();
    expect(conn.readyState).toBe(1);
    expect(conn.OPEN).toBe(1);
    expect(conn.isClosed).toBe(false);
  });

  it('should store sent messages', () => {
    const conn = createMockConnection();
    conn.send('{"type":"test"}');
    conn.send('{"type":"test2"}');

    expect(conn.sentMessages).toHaveLength(2);
    expect(conn.sentMessages[0]).toBe('{"type":"test"}');
  });

  it('should parse messages as JSON', () => {
    const conn = createMockConnection();
    conn.send('{"type":"welcome","id":"p1"}');

    const messages = conn.getSentMessagesAsJson<{ type: string; id: string }>();
    expect(messages).toHaveLength(1);
    expect(messages[0]?.type).toBe('welcome');
    expect(messages[0]?.id).toBe('p1');
  });

  it('should get last message', () => {
    const conn = createMockConnection();
    conn.send('{"type":"first"}');
    conn.send('{"type":"second"}');

    const last = conn.getLastMessageAsJson<{ type: string }>();
    expect(last?.type).toBe('second');
  });

  it('should return undefined for last message when empty', () => {
    const conn = createMockConnection();
    expect(conn.getLastMessageAsJson()).toBeUndefined();
  });

  it('should close connection', () => {
    const conn = createMockConnection();
    conn.close();

    expect(conn.readyState).toBe(3);
    expect(conn.isClosed).toBe(true);
  });

  it('should not store messages after close', () => {
    const conn = createMockConnection();
    conn.send('{"type":"before"}');
    conn.close();
    conn.send('{"type":"after"}');

    expect(conn.sentMessages).toHaveLength(1);
    expect(conn.sentMessages[0]).toBe('{"type":"before"}');
  });

  it('should clear messages', () => {
    const conn = createMockConnection();
    conn.send('{"type":"test"}');
    conn.clearSentMessages();

    expect(conn.sentMessages).toHaveLength(0);
  });
});

describe('createMockLandmarks', () => {
  it('should create 21 landmarks', () => {
    const landmarks = createMockLandmarks();
    expect(landmarks).toHaveLength(21);
  });

  it('should create landmarks with normalized coordinates', () => {
    const landmarks = createMockLandmarks();
    for (const lm of landmarks) {
      expect(lm.x).toBeGreaterThanOrEqual(0);
      expect(lm.x).toBeLessThanOrEqual(1);
      expect(lm.y).toBeGreaterThanOrEqual(0);
      expect(lm.y).toBeLessThanOrEqual(1);
    }
  });

  it('should position hand at specified coordinates', () => {
    const landmarks = createMockLandmarks({ x: 0.2, y: 0.3 });
    // Wrist should be at the base position
    expect(landmarks[0]?.x).toBe(0.2);
    expect(landmarks[0]?.y).toBe(0.3);
  });

  it('should create raised hand with low Y value', () => {
    const landmarks = createMockLandmarks({ raised: true });
    // Wrist should be in upper part of frame
    expect(landmarks[0]?.y).toBeLessThan(0.4);
  });

  it('should create pinching gesture', () => {
    const pinching = createMockLandmarks({ pinching: true });
    const notPinching = createMockLandmarks({ pinching: false });

    // Thumb tip (4) and index tip (8) should be closer when pinching
    const pinchDistance = Math.hypot(
      (pinching[4]?.x ?? 0) - (pinching[8]?.x ?? 0),
      (pinching[4]?.y ?? 0) - (pinching[8]?.y ?? 0)
    );
    const normalDistance = Math.hypot(
      (notPinching[4]?.x ?? 0) - (notPinching[8]?.x ?? 0),
      (notPinching[4]?.y ?? 0) - (notPinching[8]?.y ?? 0)
    );

    expect(pinchDistance).toBeLessThan(normalDistance);
  });
});

describe('createMockTrackedHand', () => {
  it('should create a tracked hand with defaults', () => {
    const hand = createMockTrackedHand();

    expect(hand.landmarks).toHaveLength(21);
    expect(hand.handedness).toBe('Right');
    expect(hand.score).toBe(0.95);
  });

  it('should respect handedness option', () => {
    const left = createMockTrackedHand({ handedness: 'Left' });
    const right = createMockTrackedHand({ handedness: 'Right' });

    expect(left.handedness).toBe('Left');
    expect(right.handedness).toBe('Right');
  });

  it('should include z coordinates in landmarks', () => {
    const hand = createMockTrackedHand({ z: 0.1 });

    for (const lm of hand.landmarks) {
      expect(lm.z).toBeDefined();
      expect(lm.z).toBe(0.1);
    }
  });
});
