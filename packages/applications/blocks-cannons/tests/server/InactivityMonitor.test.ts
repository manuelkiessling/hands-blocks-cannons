import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InactivityMonitor } from '../../src/server/utils/InactivityMonitor.js';

describe('InactivityMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('startup timeout', () => {
    it('should trigger shutdown if no one connects within timeout', () => {
      const onShutdown = vi.fn();
      const monitor = new InactivityMonitor({
        timeoutMs: 5000,
        checkIntervalMs: 1000,
        onShutdown,
      });

      // Advance time past the timeout
      vi.advanceTimersByTime(6000);

      expect(onShutdown).toHaveBeenCalledTimes(1);
      expect(onShutdown).toHaveBeenCalledWith(
        expect.stringContaining('No players connected within')
      );

      monitor.stop();
    });

    it('should not trigger shutdown before timeout', () => {
      const onShutdown = vi.fn();
      const monitor = new InactivityMonitor({
        timeoutMs: 5000,
        checkIntervalMs: 1000,
        onShutdown,
      });

      // Advance time but not past timeout
      vi.advanceTimersByTime(4000);

      expect(onShutdown).not.toHaveBeenCalled();

      monitor.stop();
    });
  });

  describe('connection tracking', () => {
    it('should not trigger startup timeout if player connects and stays active', () => {
      const onShutdown = vi.fn();
      const monitor = new InactivityMonitor({
        timeoutMs: 5000,
        checkIntervalMs: 1000,
        onShutdown,
      });

      // Player connects before timeout
      vi.advanceTimersByTime(2000);
      monitor.recordConnection(true);

      // Simulate activity while connected (prevents activity timeout)
      vi.advanceTimersByTime(2000);
      monitor.recordActivity();

      vi.advanceTimersByTime(2000);
      monitor.recordActivity();

      vi.advanceTimersByTime(2000);
      monitor.recordActivity();

      // Total time: 8 seconds - past startup timeout, but player is active
      // Should not have triggered because player is connected and active
      expect(onShutdown).not.toHaveBeenCalled();

      monitor.stop();
    });

    it('should trigger shutdown when all players disconnect for timeout period', () => {
      const onShutdown = vi.fn();
      const monitor = new InactivityMonitor({
        timeoutMs: 5000,
        checkIntervalMs: 1000,
        onShutdown,
      });

      // Player connects
      monitor.recordConnection(true);
      vi.advanceTimersByTime(1000);

      // Player disconnects
      monitor.recordConnection(false);

      // Advance past timeout
      vi.advanceTimersByTime(6000);

      expect(onShutdown).toHaveBeenCalledTimes(1);
      expect(onShutdown).toHaveBeenCalledWith(expect.stringContaining('No players connected for'));

      monitor.stop();
    });

    it('should trigger shutdown if player is connected but inactive', () => {
      const onShutdown = vi.fn();
      const monitor = new InactivityMonitor({
        timeoutMs: 5000,
        checkIntervalMs: 1000,
        onShutdown,
      });

      // Player connects
      monitor.recordConnection(true);

      // Player does nothing for timeout period
      vi.advanceTimersByTime(6000);

      expect(onShutdown).toHaveBeenCalledTimes(1);
      expect(onShutdown).toHaveBeenCalledWith(expect.stringContaining('No activity for'));

      monitor.stop();
    });

    it('should track connection count correctly', () => {
      const onShutdown = vi.fn();
      const monitor = new InactivityMonitor({
        timeoutMs: 5000,
        checkIntervalMs: 1000,
        onShutdown,
      });

      expect(monitor.getConnectionCount()).toBe(0);

      monitor.recordConnection(true);
      expect(monitor.getConnectionCount()).toBe(1);

      monitor.recordConnection(true);
      expect(monitor.getConnectionCount()).toBe(2);

      monitor.recordConnection(false);
      expect(monitor.getConnectionCount()).toBe(1);

      monitor.recordConnection(false);
      expect(monitor.getConnectionCount()).toBe(0);

      // Should not go negative
      monitor.recordConnection(false);
      expect(monitor.getConnectionCount()).toBe(0);

      monitor.stop();
    });
  });

  describe('activity tracking', () => {
    it('should reset timeout when activity is recorded', () => {
      const onShutdown = vi.fn();
      const monitor = new InactivityMonitor({
        timeoutMs: 5000,
        checkIntervalMs: 1000,
        onShutdown,
      });

      // Player connects
      monitor.recordConnection(true);

      // Wait 3 seconds
      vi.advanceTimersByTime(3000);

      // Record activity (resets the timer)
      monitor.recordActivity();

      // Wait another 3 seconds (6 total since start, but only 3 since activity)
      vi.advanceTimersByTime(3000);

      // Should not have triggered yet
      expect(onShutdown).not.toHaveBeenCalled();

      // Wait 3 more seconds (6 since last activity)
      vi.advanceTimersByTime(3000);

      expect(onShutdown).toHaveBeenCalledTimes(1);
      expect(onShutdown).toHaveBeenCalledWith(expect.stringContaining('No activity for'));

      monitor.stop();
    });
  });

  describe('stop', () => {
    it('should stop checking after stop() is called', () => {
      const onShutdown = vi.fn();
      const monitor = new InactivityMonitor({
        timeoutMs: 5000,
        checkIntervalMs: 1000,
        onShutdown,
      });

      // Stop immediately
      monitor.stop();

      // Advance past timeout
      vi.advanceTimersByTime(10000);

      // Should not have triggered because monitor was stopped
      expect(onShutdown).not.toHaveBeenCalled();
    });
  });
});
